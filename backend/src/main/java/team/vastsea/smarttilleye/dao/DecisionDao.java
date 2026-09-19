package team.vastsea.smarttilleye.dao;

import org.apache.ibatis.annotations.Param;
import org.springframework.stereotype.Repository;
import team.vastsea.smarttilleye.entity.Decision;

import java.util.List;
@Repository
public interface DecisionDao {
    // 添加决策任务
    int insert(@Param("decision") Decision decision);

    //删除任务
    int deleteById(@Param("id") Integer id);

    //根据ID查找
    Decision findById(@Param("id") Integer id);

    //更新任务信息
    int update(@Param("decision") Decision decision);

    // 分页查询所有记录
    List<Decision> getAll(@Param("offset") int offset, @Param("pageSize") int pageSize);

    //查询总数
    int countAll();

    //获取最新一条已处理的建议
    Decision findLatestProcessed();

    //获取最新一条未处理的信息
    Decision findLatestUnprocessed();
}