ALTER TABLE race_results DROP CONSTRAINT chk_race_results_mode;
ALTER TABLE race_results ADD CONSTRAINT chk_race_results_mode CHECK (mode IN ('SOLO', 'LOCAL', 'ONLINE'));
