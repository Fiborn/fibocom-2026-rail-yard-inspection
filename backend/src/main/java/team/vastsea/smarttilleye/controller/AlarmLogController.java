package team.vastsea.smarttilleye.controller;

import org.springframework.core.io.FileSystemResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import team.vastsea.smarttilleye.entity.AlarmRecord;
import team.vastsea.smarttilleye.entity.JsonResult;
import team.vastsea.smarttilleye.service.AlarmLogService;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

@RestController
@RequestMapping("/alarm-log")
public class AlarmLogController {
    private final AlarmLogService alarmLogService;

    public AlarmLogController(AlarmLogService alarmLogService) {
        this.alarmLogService = alarmLogService;
    }

    @PostMapping("/append")
    public JsonResult<String> append(@RequestBody AlarmRecord record) throws IOException {
        Path file = alarmLogService.append(record);
        return JsonResult.res(0, "Alarm record saved", file.toAbsolutePath().toString());
    }

    @GetMapping("/download")
    public ResponseEntity<FileSystemResource> downloadToday() throws IOException {
        Path file = alarmLogService.todayFile();
        if (Files.notExists(file)) {
            alarmLogService.append(new AlarmRecord());
        }
        String filename = URLEncoder.encode(file.getFileName().toString(), StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + filename)
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(new FileSystemResource(file));
    }
}
