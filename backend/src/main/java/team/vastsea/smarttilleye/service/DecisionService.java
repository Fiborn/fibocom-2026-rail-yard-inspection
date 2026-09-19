package team.vastsea.smarttilleye.service;

import team.vastsea.smarttilleye.entity.Decision;

import java.util.List;

public interface DecisionService {

    // 添加决策任务
    Integer insert(Decision decision);

    // 删除任务
    int deleteById(Integer id);

    // 根据ID查找
    Decision findById(Integer id);

    // 更新用户信息
    int update(Decision decision);

    // 分页查询所有用户
    List<Decision> getAll(int page, int limit);

    // 统计用户总数
    int countAll();

    // 获取最新一条已处理的建议
    Decision findLatestProcessed();

    //获取最新一条未处理的信息
    Decision findLatestUnprocessed();
}
