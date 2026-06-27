-- ProfAI style catalog (spec §8). Model ids pinned; verify live ids before launch.
-- Canonical model_key: "google/gemini-3-pro-image" | "gpt-image-2" | free "google/gemini-3.1-flash-image-preview".
insert into public.style_presets
  (id, name_ko, family, model_key, prompt_template, size, quality, credit_cost, is_active, sort_order)
values
  -- 비즈·증명사진 (identity critical) → Nano Banana Pro (google/gemini-3-pro-image), 2K
  ('biz_linkedin', '링크드인 헤드샷', 'business', 'google/gemini-3-pro-image',
   'Professional LinkedIn headshot, clean studio lighting, neutral background, business attire, sharp focus, preserve the person''s facial identity exactly.', '2K', 'high', 1, true, 10),
  ('biz_id_kr', '한국 증명사진(흰배경 정장)', 'business', 'google/gemini-3-pro-image',
   'Korean ID photo, pure white background, formal suit, front-facing, evenly lit, passport/ID style, preserve facial identity exactly.', '2K', 'high', 1, true, 11),
  ('biz_color_bg', '컬러배경 프로필', 'business', 'google/gemini-3-pro-image',
   'Corporate profile photo on a solid color gradient background, soft key light, confident expression, preserve facial identity exactly.', '2K', 'high', 1, true, 12),

  -- 컨셉 화보 (editorial) → GPT Image 2 high (A/B vs gemini), 1024x1536
  ('edit_cinematic', '시네마틱 필름', 'editorial', 'gpt-image-2',
   'Cinematic film-still portrait, moody key light, shallow depth of field, anamorphic look, filmic color grade, preserve facial identity.', '1024x1536', 'high', 1, true, 20),
  ('edit_vintage', '빈티지', 'editorial', 'gpt-image-2',
   'Vintage analog portrait, warm faded tones, soft grain, retro wardrobe, nostalgic mood, preserve facial identity.', '1024x1536', 'high', 1, true, 21),
  ('edit_season', '계절(벚꽃·단풍)', 'editorial', 'google/gemini-3-pro-image',
   'Seasonal outdoor portrait among cherry blossoms or autumn maple leaves, natural golden light, bokeh background, preserve facial identity.', '1024x1536', 'high', 1, true, 22),

  -- SNS 감성 → GPT Image 2 high, 1024x1536
  ('sns_insta', '인스타 데일리', 'sns', 'gpt-image-2',
   'Instagram daily lifestyle portrait, candid natural light, trendy casual outfit, airy bright tones, preserve facial identity.', '1024x1536', 'high', 1, true, 30),
  ('sns_cafe', '카페 무드', 'sns', 'gpt-image-2',
   'Cozy cafe-mood portrait, warm ambient window light, coffee-shop background bokeh, relaxed vibe, preserve facial identity.', '1024x1536', 'high', 1, true, 31),
  ('sns_bw', '흑백', 'sns', 'gpt-image-2',
   'High-contrast black and white portrait, dramatic monochrome lighting, fine grain, timeless mood, preserve facial identity.', '1024x1536', 'high', 1, true, 32),

  -- 판타지·아트 (identity less critical) → GPT Image 2, medium
  ('fan_cyberpunk', '사이버펑크', 'fantasy', 'gpt-image-2',
   'Cyberpunk neon-lit portrait, futuristic city backdrop, rim lighting in magenta and cyan, high-tech wardrobe, keep recognizable likeness.', '1024x1536', 'medium', 1, true, 40),
  ('fan_anime', '애니풍', 'fantasy', 'gpt-image-2',
   'Anime-style illustrated portrait, clean cel shading, expressive eyes, vibrant palette, keep recognizable likeness.', '1024x1536', 'medium', 1, true, 41),
  ('fan_renaissance', '르네상스 유화', 'fantasy', 'gpt-image-2',
   'Renaissance oil-painting portrait, chiaroscuro lighting, classical wardrobe, painterly brushwork, keep recognizable likeness.', '1024x1536', 'medium', 1, true, 42)
on conflict (id) do update set
  name_ko = excluded.name_ko,
  family = excluded.family,
  model_key = excluded.model_key,
  prompt_template = excluded.prompt_template,
  size = excluded.size,
  quality = excluded.quality,
  credit_cost = excluded.credit_cost,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order;
