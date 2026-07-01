create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone text not null,
  date_time text not null,
  barber_name text not null default 'Any Available Barber',
  services text[] not null default array['Haircut'],
  total_price integer not null default 150,
  created_at timestamptz not null default now()
);

create index if not exists bookings_created_at_idx
on public.bookings (created_at desc);
