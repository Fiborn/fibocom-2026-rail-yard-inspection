package team.vastsea.smarttilleye.service;

import org.springframework.stereotype.Service;
import team.vastsea.smarttilleye.entity.AlarmRecord;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

@Service
public class AlarmLogService {
    private static final long SAME_TYPE_COOLDOWN_MS = 30_000L;
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm:ss");
    private static final String HEADER = "告警序号,触发时间,目标类别,静态标签,告警等级,识别置信度,x1,y1,x2,y2";

    private final Path logDir = Paths.get(System.getProperty("user.dir"), "alarm-records");
    private final Map<String, Long> lastWriteByType = new HashMap<>();

    public synchronized Path append(AlarmRecord record) throws IOException {
        String targetClass = record == null ? null : record.getTargetClass();
        long now = System.currentTimeMillis();
        if (!isBlank(targetClass)) {
            Long lastWrite = lastWriteByType.get(targetClass);
            if (lastWrite != null && now - lastWrite < SAME_TYPE_COOLDOWN_MS) {
                return todayFile();
            }
        }
        Files.createDirectories(logDir);
        Path file = todayFile();
        boolean newFile = Files.notExists(file) || Files.size(file) == 0;
        long nextNo = newFile ? 1 : Math.max(1, Files.lines(file, StandardCharsets.UTF_8).count());

        try (BufferedWriter writer = Files.newBufferedWriter(file, StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.APPEND)) {
            if (newFile) {
                writer.write('\ufeff');
                writer.write(HEADER);
                writer.newLine();
            }
            writer.write(toCsvLine(nextNo, record));
            writer.newLine();
        }
        if (!isBlank(targetClass)) lastWriteByType.put(targetClass, now);
        return file;
    }

    public Path todayFile() {
        return logDir.resolve("alarm-records-" + LocalDate.now().format(DATE) + ".csv");
    }

    private String toCsvLine(long no, AlarmRecord record) {
        String triggerTime = isBlank(record.getTriggerTime())
                ? LocalDateTime.now().format(TIME)
                : record.getTriggerTime();
        return String.join(",",
                csv(String.valueOf(no)),
                csv(triggerTime),
                csv(record.getTargetClass()),
                csv(record.getLabel()),
                csv(record.getLevel()),
                csv(format(record.getConfidence())),
                csv(format(record.getX1())),
                csv(format(record.getY1())),
                csv(format(record.getX2())),
                csv(format(record.getY2()))
        );
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private String format(Double value) {
        return value == null ? "" : String.format("%.4f", value);
    }

    private String csv(String value) {
        String safe = value == null ? "" : value;
        return "\"" + safe.replace("\"", "\"\"") + "\"";
    }
}
