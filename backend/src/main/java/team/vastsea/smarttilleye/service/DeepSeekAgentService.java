package team.vastsea.smarttilleye.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import team.vastsea.smarttilleye.entity.AgentChatRequest;
import team.vastsea.smarttilleye.entity.AgentChatResponse;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

@Service
public class DeepSeekAgentService {
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String apiKey;
    private final String baseUrl;
    private final String model;

    public DeepSeekAgentService(
            ObjectMapper objectMapper,
            @Value("${deepseek.api-key:}") String apiKey,
            @Value("${deepseek.base-url:https://api.deepseek.com}") String baseUrl,
            @Value("${deepseek.model:deepseek-chat}") String model) {
        this.objectMapper = objectMapper;
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.baseUrl = baseUrl == null ? "https://api.deepseek.com" : baseUrl.replaceAll("/+$", "");
        this.model = model;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(8))
                .build();
    }

    public AgentChatResponse chat(AgentChatRequest request) {
        String question = request.getQuestion() == null ? "" : request.getQuestion().trim();
        if (question.isBlank()) {
            return new AgentChatResponse("请输入要咨询的问题。");
        }
        if (apiKey.isBlank()) {
            return new AgentChatResponse("DeepSeek API Key 未配置。请先在启动前设置 DEEPSEEK_API_KEY。");
        }

        String context = request.getContext() == null ? "" : request.getContext().trim();
        String systemPrompt = """
                你是 SmartTillEye 铁路货运装卸巡检系统的智能 Agent。
                回答要简洁、可执行，优先围绕巡检安全、异常处置、设备状态、路径定位和比赛演示。
                不要编造实时传感器数据；如果信息不足，说明需要查看视频、告警或定位数据。
                """;

        Map<String, Object> body = Map.of(
                "model", model,
                "temperature", 0.3,
                "messages", List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", "当前界面上下文：" + context + "\n\n问题：" + question)
                )
        );

        try {
            String requestBody = objectMapper.writeValueAsString(body);
            HttpRequest httpRequest = HttpRequest.newBuilder()
                    .uri(URI.create(baseUrl + "/chat/completions"))
                    .timeout(Duration.ofSeconds(20))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .build();

            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return new AgentChatResponse("DeepSeek 调用失败：HTTP " + response.statusCode());
            }

            String raw = response.body();

            JsonNode root = objectMapper.readTree(raw);
            String answer = root.path("choices").path(0).path("message").path("content").asText();
            if (answer == null || answer.isBlank()) {
                return new AgentChatResponse("DeepSeek 已响应，但没有返回有效内容。");
            }
            return new AgentChatResponse(answer.trim());
        } catch (Exception error) {
            return new AgentChatResponse("DeepSeek 调用失败：" + error.getMessage());
        }
    }
}
