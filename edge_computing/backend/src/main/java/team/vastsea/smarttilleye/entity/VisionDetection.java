package team.vastsea.smarttilleye.entity;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class VisionDetection {
    private String className;
    private double score;
    private String level;
    private double x1;
    private double y1;
    private double x2;
    private double y2;
}
