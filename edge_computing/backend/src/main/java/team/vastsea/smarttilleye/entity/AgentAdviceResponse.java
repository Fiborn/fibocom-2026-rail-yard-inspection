package team.vastsea.smarttilleye.entity;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class AgentAdviceResponse {
    private String targetClass;
    private String label;
    private Double confidence;
    private String severity;
    private String advice;
}
