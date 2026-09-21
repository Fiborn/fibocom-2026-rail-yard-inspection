package team.vastsea.smarttilleye.entity;

import lombok.Data;

@Data
public class AlarmRecord {
    private String triggerTime;
    private String targetClass;
    private String label;
    private String level;
    private Double confidence;
    private Double x1;
    private Double y1;
    private Double x2;
    private Double y2;
}
