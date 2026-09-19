package team.vastsea.smarttilleye.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import team.vastsea.smarttilleye.entity.Decision;
import team.vastsea.smarttilleye.entity.JsonResult;
import team.vastsea.smarttilleye.entity.TableResult;
import team.vastsea.smarttilleye.service.DecisionService;

import java.util.List;

@RestController
@RequestMapping("/decision")
public class DecisionController {
    @Autowired
    private DecisionService decisionService;

    // 获取指定 ID 的记录
    @GetMapping("/{id}")
    public JsonResult<Decision> findById(@PathVariable Integer id) {
        Decision result = decisionService.findById(id);
        if (result!= null) {
            return new JsonResult<>(0, "Success", result);
        } else {
            return new JsonResult<>(404, "Not found", null);
        }
    }
    // 获取最新的已处理的记录
    @GetMapping("/findLatestProcessed")
    public JsonResult<Decision> findLatestProcessed() {
        Decision result = decisionService.findLatestProcessed();
        if (result!= null) {
            return new JsonResult<>(0, "Success", result);
        } else {
            return new JsonResult<>(404, "Not found", null);
        }
    }
    // 获取最新的未处理的记录
    @GetMapping("/findLatestUnprocessed")
    public JsonResult<Decision> findLatestUnprocessed() {
        Decision result = decisionService.findLatestUnprocessed();
        if (result!= null) {
            return new JsonResult<>(0, "Success", result);
        } else {
            return new JsonResult<>(404, "Not found", null);
        }
    }
    // 插入
    @PostMapping("/insert")
    public JsonResult<Integer> insert(@RequestBody Decision object) {
//        System.out.println("Received object: " + object); // 打印接收对象
        decisionService.insert(object);
        return new JsonResult<>(0, "Created successfully", object.getId());
    }

    // 更新
    @PostMapping("/update")
    public JsonResult<Integer> update(@RequestBody Decision object) {
        int result = decisionService.update(object);
        if (result > 0) {
            return new JsonResult<>(0, "Updated successfully", result);
        } else {
            return new JsonResult<>(404, "Not found", result);
        }
    }

    // 删除
    @DeleteMapping("/delete/{id}")
    public JsonResult<Integer> deleteById(@PathVariable Integer id) {
        int result = decisionService.deleteById(id);
        if (result > 0) {
            return new JsonResult<>(0, "Deleted successfully", result);
        } else {
            return new JsonResult<>(404, "Not found", result);
        }
    }

    // 分页查询所有记录
    @GetMapping("/all")
    public TableResult<List<Decision>> findAll(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int limit) {
        List<Decision> obj = decisionService.getAll(page, limit);
        int count =decisionService.countAll();
        return TableResult.res(0, "success", count, obj);
    }

}