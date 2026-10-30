-- Optional exact weight list for equipment (e.g. a dumbbell rack), ascending kg.
-- Null keeps the linear min + k·increment model. sync_push builds its column list
-- from information_schema at call time, so the new column syncs without changes.
alter table public.equipment add column weights_kg double precision[];
