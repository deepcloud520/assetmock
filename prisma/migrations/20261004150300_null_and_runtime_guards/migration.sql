DROP TRIGGER DecisionConstraint_rule_INSERT;
CREATE TRIGGER DecisionConstraint_rule_INSERT BEFORE INSERT ON DecisionConstraint WHEN NOT COALESCE((
 (NEW.type IN ('NO_USE_ASSET','NO_USE_GOAL_FUND','NO_NEW_DEBT') AND NEW.operator='NOT_USE' AND NEW.thresholdValue IS NULL AND NEW.unit IS NULL AND NEW.currency IS NULL)
 OR (NEW.type IN ('MIN_LIQUID','NO_USE_EMERGENCY') AND NEW.operator IN ('GT','GTE') AND NEW.thresholdValue>=0 AND NEW.unit='CENTS' AND NEW.currency='CNY')
 OR (NEW.type='MAX_DEBT_RATIO' AND NEW.operator IN ('LT','LTE') AND NEW.thresholdValue BETWEEN 0 AND 10000 AND NEW.unit='BPS' AND NEW.currency IS NULL)
 OR (NEW.type='OTHER' AND NEW.operator='MANUAL' AND NEW.thresholdValue IS NULL AND NEW.unit IS NULL AND NEW.currency IS NULL)
),0) OR (NEW.type='NO_USE_ASSET')<>(NEW.assetId IS NOT NULL) OR (NEW.type='NO_USE_GOAL_FUND')<>(NEW.goalId IS NOT NULL) OR (NEW.scope='DECISION' AND NEW.decisionId IS NULL) OR (NEW.scope='GLOBAL' AND NEW.decisionId IS NOT NULL) OR (NEW.recordKind='SNAPSHOT' AND NEW.planVersionId IS NULL)
BEGIN SELECT RAISE(ABORT,'invalid structured redline'); END;

CREATE TRIGGER ManagerState_business_INSERT BEFORE INSERT ON ManagerState WHEN EXISTS(SELECT 1 FROM Workspace WHERE id=NEW.workspaceId AND businessMigratedAt IS NOT NULL) AND (NEW.budgetJson<>'{}' OR NEW.insuranceJson<>'{}' OR NEW.investmentJson<>'{}') BEGIN SELECT RAISE(ABORT,'business facts must use dedicated tables'); END;
CREATE TRIGGER ManagerState_business_UPDATE BEFORE UPDATE ON ManagerState WHEN EXISTS(SELECT 1 FROM Workspace WHERE id=NEW.workspaceId AND businessMigratedAt IS NOT NULL) AND (NEW.budgetJson<>'{}' OR NEW.insuranceJson<>'{}' OR NEW.investmentJson<>'{}') BEGIN SELECT RAISE(ABORT,'business facts must use dedicated tables'); END;
