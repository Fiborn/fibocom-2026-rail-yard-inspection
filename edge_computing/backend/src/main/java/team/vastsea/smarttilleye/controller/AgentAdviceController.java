package team.vastsea.smarttilleye.controller;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import team.vastsea.smarttilleye.entity.AgentChatRequest;
import team.vastsea.smarttilleye.entity.AgentChatResponse;
import team.vastsea.smarttilleye.entity.AgentAdviceRequest;
import team.vastsea.smarttilleye.entity.AgentAdviceResponse;
import team.vastsea.smarttilleye.entity.JsonResult;
import team.vastsea.smarttilleye.service.AgentAdviceService;
import team.vastsea.smarttilleye.service.DeepSeekAgentService;

@RestController
@RequestMapping("/agent")
public class AgentAdviceController {
    private final AgentAdviceService agentAdviceService;
    private final DeepSeekAgentService deepSeekAgentService;

    public AgentAdviceController(AgentAdviceService agentAdviceService, DeepSeekAgentService deepSeekAgentService) {
        this.agentAdviceService = agentAdviceService;
        this.deepSeekAgentService = deepSeekAgentService;
    }

    @PostMapping("/advice")
    public JsonResult<AgentAdviceResponse> advice(@RequestBody AgentAdviceRequest request) {
        return JsonResult.res(0, "success", agentAdviceService.advice(request));
    }

    @PostMapping("/chat")
    public JsonResult<AgentChatResponse> chat(@RequestBody AgentChatRequest request) {
        return JsonResult.res(0, "success", deepSeekAgentService.chat(request));
    }
}
