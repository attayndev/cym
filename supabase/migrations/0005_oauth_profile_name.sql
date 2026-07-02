-- OAuth users (Apple/Google) arrive with their name in raw_user_meta_data;
-- copy it into the profile at signup so it isn't blank. Existing rows are
-- untouched (on conflict do nothing).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      ''
    )
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;
