package team.vastsea.smarttilleye.entity;

import lombok.Data;

@Data
public class AgentAdviceRequest {
    private String targetClass;
    private String label;
    private Double confidence;
}
