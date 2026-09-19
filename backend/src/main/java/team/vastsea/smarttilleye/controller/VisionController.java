package team.vastsea.smarttilleye.controller;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import team.vastsea.smarttilleye.entity.JsonResult;
import team.vastsea.smarttilleye.entity.VisionDetectRequest;
import team.vastsea.smarttilleye.entity.VisionDetectResponse;
import team.vastsea.smarttilleye.service.BackendVisionService;

import java.io.IOException;

@RestController
@RequestMapping("/vision")
public class VisionController {
    private final BackendVisionService backendVisionService;

    public VisionController(BackendVisionService backendVisionService) {
        this.backendVisionService = backendVisionService;
    }

    @PostMapping("/detect")
    public JsonResult<VisionDetectResponse> detect(@RequestBody VisionDetectRequest request) throws IOException {
        return JsonResult.res(0, "success", backendVisionService.detect(request));
    }
}
