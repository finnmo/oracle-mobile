-- Seed pubs — replace/extend with your actual pub list
INSERT OR IGNORE INTO pubs (id, name, address, mapsUrl, active) VALUES
  ('pub-001', 'The Breakfast Road Tavern', '1 Breakfast Rd, Balga WA 6061',            'https://maps.google.com/?q=The+Breakfast+Road+Tavern+Balga', 1),
  ('pub-002', 'The Rosemount Hotel',        '459 Fitzgerald St, North Perth WA 6006',   'https://maps.google.com/?q=The+Rosemount+Hotel+North+Perth', 1),
  ('pub-003', 'The Elford',                 '106 Scarborough Beach Rd, Mount Hawthorn WA 6016', 'https://maps.google.com/?q=The+Elford+Mount+Hawthorn', 1),
  ('pub-004', 'The Brisbane Hotel',         '292 Beaufort St, Perth WA 6000',           'https://maps.google.com/?q=The+Brisbane+Hotel+Perth', 1),
  ('pub-005', 'The Newport Hotel',          '2 South Tce, Fremantle WA 6160',           'https://maps.google.com/?q=The+Newport+Hotel+Fremantle', 1),
  ('pub-006', 'The Helvetica',              '101 St Georges Tce, Perth WA 6000',        'https://maps.google.com/?q=The+Helvetica+Perth', 1),
  ('pub-007', 'The Mechanics Institute',    '222 Brisbane St, Perth WA 6000',           'https://maps.google.com/?q=The+Mechanics+Institute+Perth', 1),
  ('pub-008', 'Northbridge Brewing Co',     '44 Lake St, Northbridge WA 6003',          'https://maps.google.com/?q=Northbridge+Brewing+Co', 1);
