package team.vastsea.smarttilleye.entity;

import lombok.Data;

@Data
public class AgentChatRequest {
    private String question;
    private String context;
}
