-- Seed pubs
INSERT OR IGNORE INTO pubs (id, name, address, mapsUrl, active) VALUES
  ('pub-001', 'The Como',          '241 Canning Hwy, Como WA 6152',              'https://maps.google.com/?q=The+Como+Hotel+Perth+WA', 1),
  ('pub-002', 'The Vic Park Hotel','605 Albany Hwy, Victoria Park WA 6100',      'https://maps.google.com/?q=Victoria+Park+Hotel+Perth+WA', 1),
  ('pub-003', 'The Balmoral',      '901 Albany Hwy, East Victoria Park WA 6101', 'https://maps.google.com/?q=The+Balmoral+Hotel+Perth+WA', 1),
  ('pub-004', 'The Broken Hill',   '314 Albany Hwy, Victoria Park WA 6100',      'https://maps.google.com/?q=Broken+Hill+Hotel+Perth+WA', 1),
  ('pub-005', 'Baillie Hill',      '15 Hill View Tce, East Victoria Park WA 6101','https://maps.google.com/?q=Baillie+Hill+Perth+WA', 1),
  ('pub-006', 'Mollys Irish Pub',  '774 Albany Hwy, East Victoria Park WA 6101',          'https://maps.google.com/?q=Mollys+Irish+Pub+Victoria+Park+WA', 1);
