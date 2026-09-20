package team.vastsea.smarttilleye.entity;

import lombok.Data;

@Data
public class VisionDetectRequest {
    private String image;
    private int width = 640;
    private int height = 640;
}
