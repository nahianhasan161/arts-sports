create table if not exists site_content (
  key text primary key,
  area text not null default 'landing-page',
  selector text,
  content text,
  image_url text,
  created_by uuid references auth.users on delete set null,
  updated_by uuid references auth.users on delete set null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create index on site_content (area);
create index on site_content (updated_at desc);

create policy "Public read site content" on site_content
  for select using (true);

create policy "Admins can manage site content" on site_content
  for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'super_admin')
    )
  );
