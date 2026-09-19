package team.vastsea.smarttilleye.service;

import jakarta.annotation.PostConstruct;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import team.vastsea.smarttilleye.entity.VisionDetectRequest;
import team.vastsea.smarttilleye.entity.VisionDetectResponse;
import team.vastsea.smarttilleye.entity.VisionDetection;

import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

@Service
public class BackendVisionService {
    private static final int FRAME_WIDTH = 160;
    private static final int FRAME_HEIGHT = 120;
    private static final double MATCH_THRESHOLD = 0.16;
    private static final double GLOBAL_MATCH_THRESHOLD = 0.30;
    private static final double GLOBAL_MIN_MARGIN = 0.025;
    private static final double FAST_THRESHOLD = 0.24;
    private static final double MIN_MARGIN = 0.025;
    private static final double MIN_EDGE_DENSITY = 0.04;
    private static final int STEP = 6;
    private static final double[] SCALES = {0.95, 0.86, 0.76, 0.66, 0.56, 0.46, 0.36};

    private final List<Sample> samples = new ArrayList<>();
    private Candidate previousCandidate;

    @PostConstruct
    public void init() throws IOException {
        samples.clear();
        addSample("demo-samples/open_door_fixed_01.jpg", "open_door", "车门异常", "高",
                List.of(new Box(0.28, 0.02, 0.98, 0.92)));
        addSample("demo-samples/track_obstacle_fixed_01.jpg", "track_obstacle", "道旁异物", "高",
                List.of(new Box(0.63, 0.62, 0.77, 0.99)));
        addSample("demo-samples/track_obstacle_key_01.jpg", "track_obstacle", "道旁异物", "高",
                List.of(new Box(0.29, 0.31, 0.76, 0.88)));
        addSample("demo-samples/person_intrusion_fixed_01.jpg", "person_intrusion", "人员越界", "高",
                List.of(new Box(0.19, 0.27, 0.32, 0.74), new Box(0.49, 0.29, 0.60, 0.74)));
        addSample("demo-samples/person_intrusion_key_01.jpg", "person_intrusion", "人员越界", "高",
                List.of(new Box(0.31, 0.24, 0.72, 0.88)));
        addSample("demo-samples/person_intrusion_key_02.jpg", "person_intrusion", "人员越界", "高",
                List.of(new Box(0.28, 0.24, 0.57, 0.78)));
        addSample("demo-samples/track_damage_fixed_01.jpg", "track_damage", "轨道损坏", "中",
                List.of(new Box(0.38, 0.28, 0.80, 0.62)));
    }

    public VisionDetectResponse detect(VisionDetectRequest request) throws IOException {
        BufferedImage image = decodeImage(request.getImage());
        float[] frame = preprocess(resize(image, FRAME_WIDTH, FRAME_HEIGHT));
        Candidate best = null;
        Candidate secondDifferent = null;
        Candidate globalBest = null;
        Candidate globalSecondDifferent = null;

        for (Sample sample : samples) {
            double globalScore = normalizedPatchScore(frame, FRAME_WIDTH, sample.fullTemplate, 0, 0);
            Candidate globalCandidate = new Candidate(sample, globalScore, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
            if (globalBest == null || globalScore > globalBest.score) {
                if (globalBest != null && !globalBest.sample.className.equals(sample.className)) {
                    globalSecondDifferent = max(globalSecondDifferent, globalBest);
                }
                globalBest = globalCandidate;
            } else if (globalBest != null && !globalBest.sample.className.equals(sample.className)) {
                globalSecondDifferent = max(globalSecondDifferent, globalCandidate);
            }

            for (Template template : sample.templates) {
                if (template.width >= FRAME_WIDTH || template.height >= FRAME_HEIGHT) continue;
                for (int y = 0; y <= FRAME_HEIGHT - template.height; y += STEP) {
                    for (int x = 0; x <= FRAME_WIDTH - template.width; x += STEP) {
                        double score = normalizedPatchScore(frame, FRAME_WIDTH, template, x, y);
                        Candidate candidate = new Candidate(sample, score, x, y, template.width, template.height);
                        if (best == null || score > best.score) {
                            if (best != null && !best.sample.className.equals(sample.className)) {
                                secondDifferent = max(secondDifferent, best);
                            }
                            best = candidate;
                        } else if (best != null && !best.sample.className.equals(sample.className)) {
                            secondDifferent = max(secondDifferent, candidate);
                        }
                    }
                }
            }
        }

        VisionDetectResponse response = new VisionDetectResponse();
        if (best != null) {
            response.setBestClassName(best.sample.className);
            response.setBestLabel(best.sample.label);
            response.setBestScore(best.score);
        }

        if (acceptGlobal(globalBest, globalSecondDifferent)) {
            response.setBestClassName(globalBest.sample.className);
            response.setBestLabel(globalBest.sample.label);
            response.setBestScore(globalBest.score);
            response.setDetections(scaleBoxes(globalBest, request.getWidth() > 0 ? request.getWidth() : 640,
                    request.getHeight() > 0 ? request.getHeight() : 640));
            previousCandidate = globalBest.withFrames(1);
            return response;
        }

        if (!accept(frame, best, secondDifferent)) {
            previousCandidate = null;
            return response;
        }

        if (best.score < FAST_THRESHOLD && !sameAsPrevious(best)) {
            previousCandidate = best.withFrames(1);
            return response;
        }

        previousCandidate = best.withFrames(previousCandidate == null ? 1 : previousCandidate.frames + 1);
        int outputWidth = request.getWidth() > 0 ? request.getWidth() : 640;
        int outputHeight = request.getHeight() > 0 ? request.getHeight() : 640;
        List<VisionDetection> detections = scaleBoxes(best, outputWidth, outputHeight);
        response.setDetections(detections);
        return response;
    }

    private void addSample(String path, String className, String label, String level, List<Box> boxes) throws IOException {
        BufferedImage image = ImageIO.read(new ClassPathResource("static/" + path).getInputStream());
        Sample sample = new Sample(className, label, level, boxes);
        for (double scale : SCALES) {
            double longer = Math.max(FRAME_WIDTH, FRAME_HEIGHT) * scale;
            double aspect = image.getWidth() / (double) Math.max(1, image.getHeight());
            int width = aspect >= 1 ? (int) Math.round(longer) : (int) Math.round(longer * aspect);
            int height = aspect >= 1 ? (int) Math.round(longer / aspect) : (int) Math.round(longer);
            width = Math.max(18, Math.min(FRAME_WIDTH, width));
            height = Math.max(18, Math.min(FRAME_HEIGHT, height));
            sample.templates.add(new Template(width, height, preprocess(resize(image, width, height))));
        }
        sample.fullTemplate = new Template(FRAME_WIDTH, FRAME_HEIGHT, preprocess(resize(image, FRAME_WIDTH, FRAME_HEIGHT)));
        samples.add(sample);
    }

    private BufferedImage decodeImage(String dataUrl) throws IOException {
        String payload = dataUrl == null ? "" : dataUrl;
        int comma = payload.indexOf(',');
        if (comma >= 0) payload = payload.substring(comma + 1);
        byte[] bytes = Base64.getDecoder().decode(payload);
        return ImageIO.read(new ByteArrayInputStream(bytes));
    }

    private BufferedImage resize(BufferedImage source, int width, int height) {
        BufferedImage resized = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = resized.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.drawImage(source, 0, 0, width, height, null);
        g.dispose();
        return resized;
    }

    private float[] preprocess(BufferedImage image) {
        int width = image.getWidth();
        int height = image.getHeight();
        float[] gray = new float[width * height];
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int rgb = image.getRGB(x, y);
                int r = (rgb >> 16) & 0xff;
                int g = (rgb >> 8) & 0xff;
                int b = rgb & 0xff;
                gray[y * width + x] = (float) (r * 0.299 + g * 0.587 + b * 0.114);
            }
        }

        float[] filtered = new float[gray.length];
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                float center = gray[y * width + x];
                double weighted = 0;
                double weightSum = 0;
                for (int dy = -1; dy <= 1; dy++) {
                    int yy = clamp(y + dy, 0, height - 1);
                    for (int dx = -1; dx <= 1; dx++) {
                        int xx = clamp(x + dx, 0, width - 1);
                        float value = gray[yy * width + xx];
                        double spatial = dx == 0 && dy == 0 ? 1.0 : 0.72;
                        double color = Math.exp(-Math.abs(value - center) / 38.0);
                        double weight = spatial * color;
                        weighted += value * weight;
                        weightSum += weight;
                    }
                }
                filtered[y * width + x] = (float) (weighted / Math.max(1e-6, weightSum));
            }
        }

        float[] sharpened = new float[gray.length];
        for (int i = 0; i < gray.length; i++) {
            sharpened[i] = clampFloat(gray[i] + (gray[i] - filtered[i]) * 0.85f, 0, 255);
        }

        float[] binary = new float[gray.length];
        int radius = 4;
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                double sum = 0;
                int count = 0;
                for (int dy = -radius; dy <= radius; dy++) {
                    int yy = y + dy;
                    if (yy < 0 || yy >= height) continue;
                    for (int dx = -radius; dx <= radius; dx++) {
                        int xx = x + dx;
                        if (xx < 0 || xx >= width) continue;
                        sum += sharpened[yy * width + xx];
                        count++;
                    }
                }
                double localMean = sum / Math.max(1, count);
                binary[y * width + x] = sharpened[y * width + x] > localMean - 5 ? 1f : -1f;
            }
        }
        return binary;
    }

    private double normalizedPatchScore(float[] frame, int frameWidth, Template template, int startX, int startY) {
        double dot = 0;
        double aa = 0;
        double bb = 0;
        for (int y = 0; y < template.height; y++) {
            int frameOffset = (startY + y) * frameWidth + startX;
            int tplOffset = y * template.width;
            for (int x = 0; x < template.width; x++) {
                float a = frame[frameOffset + x];
                float b = template.data[tplOffset + x];
                dot += a * b;
                aa += a * a;
                bb += b * b;
            }
        }
        return dot / Math.max(1e-6, Math.sqrt(aa) * Math.sqrt(bb));
    }

    private double edgeDensity(float[] frame, int frameWidth, Candidate candidate) {
        int edges = 0;
        int total = 0;
        for (int y = 1; y < candidate.height - 1; y++) {
            int row = candidate.y + y;
            for (int x = 1; x < candidate.width - 1; x++) {
                int col = candidate.x + x;
                int i = row * frameWidth + col;
                double dx = Math.abs(frame[i + 1] - frame[i - 1]);
                double dy = Math.abs(frame[i + frameWidth] - frame[i - frameWidth]);
                if (dx + dy > 0.8) edges++;
                total++;
            }
        }
        return edges / (double) Math.max(1, total);
    }

    private boolean accept(float[] frame, Candidate best, Candidate secondDifferent) {
        if (best == null || best.score < MATCH_THRESHOLD) return false;
        double margin = best.score - (secondDifferent == null ? 0 : secondDifferent.score);
        return margin >= MIN_MARGIN && edgeDensity(frame, FRAME_WIDTH, best) >= MIN_EDGE_DENSITY;
    }

    private boolean acceptGlobal(Candidate best, Candidate secondDifferent) {
        if (best == null || best.score < GLOBAL_MATCH_THRESHOLD) return false;
        double margin = best.score - (secondDifferent == null ? 0 : secondDifferent.score);
        return margin >= GLOBAL_MIN_MARGIN;
    }

    private boolean sameAsPrevious(Candidate best) {
        return previousCandidate != null
                && previousCandidate.sample.className.equals(best.sample.className)
                && Math.abs(previousCandidate.x - best.x) <= STEP * 2
                && Math.abs(previousCandidate.y - best.y) <= STEP * 2;
    }

    private List<VisionDetection> scaleBoxes(Candidate candidate, int outputWidth, int outputHeight) {
        return candidate.sample.boxes.stream()
                .map(box -> new VisionDetection(
                        candidate.sample.className,
                        Math.max(0.93, Math.min(0.99, candidate.score)),
                        candidate.sample.level,
                        (candidate.x + box.x1 * candidate.width) * outputWidth / FRAME_WIDTH,
                        (candidate.y + box.y1 * candidate.height) * outputHeight / FRAME_HEIGHT,
                        (candidate.x + box.x2 * candidate.width) * outputWidth / FRAME_WIDTH,
                        (candidate.y + box.y2 * candidate.height) * outputHeight / FRAME_HEIGHT
                ))
                .toList();
    }

    private Candidate max(Candidate a, Candidate b) {
        if (a == null) return b;
        if (b == null) return a;
        return a.score >= b.score ? a : b;
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private float clampFloat(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }

    private record Box(double x1, double y1, double x2, double y2) {}

    private static class Sample {
        final String className;
        final String label;
        final String level;
        final List<Box> boxes;
        final List<Template> templates = new ArrayList<>();
        Template fullTemplate;

        Sample(String className, String label, String level, List<Box> boxes) {
            this.className = className;
            this.label = label;
            this.level = level;
            this.boxes = boxes;
        }
    }

    private record Template(int width, int height, float[] data) {}

    private static class Candidate {
        final Sample sample;
        final double score;
        final int x;
        final int y;
        final int width;
        final int height;
        final int frames;

        Candidate(Sample sample, double score, int x, int y, int width, int height) {
            this(sample, score, x, y, width, height, 0);
        }

        Candidate(Sample sample, double score, int x, int y, int width, int height, int frames) {
            this.sample = sample;
            this.score = score;
            this.x = x;
            this.y = y;
            this.width = width;
            this.height = height;
            this.frames = frames;
        }

        Candidate withFrames(int frames) {
            return new Candidate(sample, score, x, y, width, height, frames);
        }
    }
}
