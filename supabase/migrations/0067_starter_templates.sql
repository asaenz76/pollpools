-- ============================================================================
-- 0067_starter_templates — Phase 8-D 8D.3: seed the starter template library.
--
-- Five published v1 templates proving breadth. Each is pure CONFIGURATION mapped
-- onto the existing tenant systems (vocabulary / feature flags / providers /
-- competition + market defaults) plus an optional demo seed. No engine branching.
-- Published rows are inserted with published_at set (immutability applies to
-- later UPDATE/DELETE, not this INSERT). Idempotent by template key.
-- ============================================================================

do $$
declare
  v_tid uuid;
  r record;
begin
  for r in
    select * from (values
      ('general', 'General Prediction Community', 'general', 'compass',
       'A neutral baseline: open predictions, social, and leaderboards.',
       $j${
         "locale":"en","timezone":"UTC",
         "vocabulary":{},
         "providers":{"result":"manual","event":"manual","notification":["in_app"]},
         "featureFlags":{"predictions_enabled":true,"global_leaderboard_enabled":true,"sharing_enabled":true,"likes_enabled":true,"creator_following_enabled":true,"achievements_enabled":true,"public_profiles_enabled":true,"creator_support_enabled":false},
         "enabledCompetitionTypes":["STANDALONE_EVENT","SEASON","TOURNAMENT","BRACKET"],
         "competitionDefaults":{"draftEnabled":false},
         "marketTemplates":[{"type":"SINGLE_CHOICE_WINNER"}],
         "settings":{"minimumRankedPredictions":5,"showPoweredBy":true,"media":{"enabled":true,"optional":true}},
         "revenue":{"creatorSupport":false,"competitorDraft":false}
       }$j$::jsonb,
       $s${"creator":{"displayName":"Demo Community"},"competitors":["Option A","Option B","Option C"],"event":{"title":"Opening Round"}}$s$::jsonb),

      ('club_sports', 'Club Sports', 'sports', 'shield',
       'Clubs, matches, and leagues with winner and draw markets.',
       $j${
         "locale":"en","timezone":"UTC",
         "vocabulary":{"competitor":{"singular":"Club","plural":"Clubs"},"event":{"singular":"Match","plural":"Matches"},"season":{"singular":"League","plural":"Leagues"}},
         "providers":{"result":"manual","event":"manual","notification":["in_app"]},
         "featureFlags":{"predictions_enabled":true,"global_leaderboard_enabled":true,"sharing_enabled":true,"creator_following_enabled":true,"creator_support_enabled":false},
         "enabledCompetitionTypes":["STANDALONE_EVENT","SEASON","TOURNAMENT"],
         "competitionDefaults":{"draftEnabled":false},
         "marketTemplates":[{"type":"SINGLE_CHOICE_WINNER","question":"Who wins this match?"}],
         "settings":{"minimumRankedPredictions":5,"showPoweredBy":true,"media":{"enabled":true,"optional":true}}
       }$j$::jsonb,
       $s${"creator":{"displayName":"Demo League"},"competitors":["North FC","South FC","Draw"],"competition":{"type":"SEASON","title":"Premier League"},"event":{"title":"Matchday 1"}}$s$::jsonb),

      ('racing', 'Racing Community', 'racing', 'flag',
       'Racers, races, and seasons with Competitor Draft and achievements.',
       $j${
         "locale":"en","timezone":"UTC",
         "vocabulary":{"competitor":{"singular":"Racer","plural":"Racers"},"event":{"singular":"Race","plural":"Races"},"season":{"singular":"Season","plural":"Seasons"}},
         "providers":{"result":"manual","event":"manual","notification":["in_app"]},
         "featureFlags":{"predictions_enabled":true,"global_leaderboard_enabled":true,"achievements_enabled":true,"sharing_enabled":true,"creator_following_enabled":true},
         "enabledCompetitionTypes":["STANDALONE_EVENT","SEASON","TOURNAMENT","BRACKET"],
         "competitionDefaults":{"draftEnabled":true},
         "marketTemplates":[{"type":"SINGLE_CHOICE_WINNER","question":"Which racer will win?"}],
         "settings":{"minimumRankedPredictions":5,"showPoweredBy":true,"media":{"enabled":true,"optional":true}},
         "revenue":{"competitorDraft":true}
       }$j$::jsonb,
       $s${"creator":{"displayName":"Demo Racing League"},"competitors":["Red","Blue","Green","Yellow","Purple","Orange","Pink","Teal"],"competition":{"type":"SEASON","title":"Season 1"},"event":{"title":"Race 1"}}$s$::jsonb),

      ('awards', 'Competition / Awards', 'competitions', 'medal',
       'Participants, rounds, and awards. No Draft; predictions and leaderboards.',
       $j${
         "locale":"en","timezone":"UTC",
         "vocabulary":{"competitor":{"singular":"Participant","plural":"Participants"},"event":{"singular":"Round","plural":"Rounds"},"competition":{"singular":"Competition","plural":"Competitions"}},
         "providers":{"result":"manual","event":"manual","notification":["in_app"]},
         "featureFlags":{"predictions_enabled":true,"global_leaderboard_enabled":true,"sharing_enabled":true},
         "enabledCompetitionTypes":["STANDALONE_EVENT","TOURNAMENT"],
         "competitionDefaults":{"draftEnabled":false},
         "marketTemplates":[{"type":"SINGLE_CHOICE_WINNER","question":"Who wins this award?"}],
         "settings":{"minimumRankedPredictions":5,"showPoweredBy":true,"media":{"enabled":true,"optional":true}}
       }$j$::jsonb,
       $s${"creator":{"displayName":"Demo Awards"},"competitors":["Nominee A","Nominee B","Nominee C"],"event":{"title":"Best in Show"}}$s$::jsonb),

      ('cook_off', 'Cook-Off / Judged Competition', 'entertainment', 'chef',
       'Chefs, rounds, and cook-offs. No media required; predictions and social.',
       $j${
         "locale":"en","timezone":"UTC",
         "vocabulary":{"competitor":{"singular":"Chef","plural":"Chefs"},"event":{"singular":"Round","plural":"Rounds"},"competition":{"singular":"Cook-Off","plural":"Cook-Offs"}},
         "providers":{"result":"manual","event":"manual","notification":["in_app"]},
         "featureFlags":{"predictions_enabled":true,"global_leaderboard_enabled":true,"sharing_enabled":true},
         "enabledCompetitionTypes":["STANDALONE_EVENT","TOURNAMENT"],
         "competitionDefaults":{"draftEnabled":false},
         "marketTemplates":[{"type":"SINGLE_CHOICE_WINNER","question":"Which chef will win?"}],
         "settings":{"minimumRankedPredictions":5,"showPoweredBy":true,"media":{"enabled":false,"optional":true}}
       }$j$::jsonb,
       $s${"creator":{"displayName":"Demo Kitchen"},"competitors":["Chef A","Chef B","Chef C"],"event":{"title":"Round 1"}}$s$::jsonb)
    ) as t(key, name, category, icon_key, description, configuration, seed_definition)
  loop
    insert into tenant_templates (key, name, description, category, status, latest_version, icon_key)
    values (r.key, r.name, r.description, r.category, 'published', 1, r.icon_key)
    on conflict (key) do nothing
    returning id into v_tid;

    if v_tid is not null then
      insert into tenant_template_versions (template_id, version, engine_version, configuration, seed_definition, changelog, published_at)
      values (v_tid, 1, '1.0', r.configuration, r.seed_definition, 'Initial starter template.', now());
    end if;
  end loop;
end $$;
