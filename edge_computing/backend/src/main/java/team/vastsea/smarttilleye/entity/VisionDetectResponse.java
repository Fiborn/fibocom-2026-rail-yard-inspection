package team.vastsea.smarttilleye.entity;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class VisionDetectResponse {
    private List<VisionDetection> detections = new ArrayList<>();
    private String bestClassName;
    private String bestLabel;
    private double bestScore;
}
