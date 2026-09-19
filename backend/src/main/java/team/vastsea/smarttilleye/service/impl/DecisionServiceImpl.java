package team.vastsea.smarttilleye.service.impl;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import team.vastsea.smarttilleye.dao.DecisionDao;
import team.vastsea.smarttilleye.entity.Decision;
import team.vastsea.smarttilleye.service.DecisionService;

import java.util.List;

@Service
public class DecisionServiceImpl implements DecisionService {

    @Autowired
    private DecisionDao dao;

    @Override
    public Integer insert(Decision decision) {
        decision.setId(dao.insert(decision));
        return decision.getId();
    }

    @Override
    public int deleteById(Integer id) {
        return dao.deleteById(id);
    }

    @Override
    public Decision findById(Integer id) {
        return dao.findById(id);
    }

    @Override
    public int update(Decision decision) {
        return dao.update(decision);
    }

    @Override
    public List<Decision> getAll(int page, int limit) {
        return dao.getAll((page-1) * limit, limit);
    }

    @Override
    public int countAll() {
        return dao.countAll();
    }

    @Override
    public Decision findLatestProcessed() {
        return dao.findLatestProcessed();
    }

    @Override
    public Decision findLatestUnprocessed(){
        return dao.findLatestUnprocessed();
    }

}
