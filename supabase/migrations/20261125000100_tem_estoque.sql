-- Tem Estoque: aplicar em um projeto Supabase novo, pelo mecanismo de migrações.
-- Depende dos esquemas auth e storage e dos papéis anon e authenticated do Supabase.
-- O bucket é privado: para exibir fotos, use download autenticado pelo Storage,
-- inclusive com a chave anônima para anúncios públicos; não use getPublicUrl.
-- Nunca exponha a service_role no navegador.

begin;

create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;
grant usage on schema privado to anon, authenticated;

create table public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  whatsapp text not null,
  cidade text not null,
  bairro text not null,
  role text not null default 'marcenaria',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint perfis_nome_valido check (
    char_length(btrim(nome)) between 2 and 120
    and nome ~ '[^[:space:]]'
  ),
  -- E.164: sinal de mais, código do país e número; sem espaços ou pontuação.
  constraint perfis_whatsapp_valido check (whatsapp ~ '^[+][1-9][0-9]{7,14}$'),
  constraint perfis_cidade_valida check (
    char_length(btrim(cidade)) between 2 and 100 and cidade ~ '[^[:space:]]'
  ),
  constraint perfis_bairro_valido check (
    char_length(btrim(bairro)) between 1 and 100 and bairro ~ '[^[:space:]]'
  ),
  constraint perfis_role_valido check (role in ('marcenaria', 'admin'))
);

create table public.anuncios (
  id uuid primary key default gen_random_uuid(),
  marcenaria_id uuid not null default auth.uid() references public.perfis(id) on delete cascade,
  material text not null,
  espessura numeric(12,3) not null,
  acabamento text not null default '',
  comprimento numeric(12,3) not null,
  largura numeric(12,3) not null,
  quantidade integer not null,
  preco numeric(12,2),
  observacoes text not null default '',
  cidade text not null,
  bairro text not null,
  status text not null default 'Disponível',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint anuncios_material_valido check (
    char_length(btrim(material)) between 1 and 120 and material ~ '[^[:space:]]'
  ),
  constraint anuncios_acabamento_valido check (char_length(acabamento) <= 120),
  constraint anuncios_observacoes_validas check (char_length(observacoes) <= 5000),
  constraint anuncios_espessura_valida check (espessura > 0 and espessura <> 'NaN'::numeric),
  constraint anuncios_comprimento_valido check (comprimento > 0 and comprimento <> 'NaN'::numeric),
  constraint anuncios_largura_valida check (largura > 0 and largura <> 'NaN'::numeric),
  constraint anuncios_preco_valido check (preco is null or (preco >= 0 and preco <> 'NaN'::numeric)),
  constraint anuncios_quantidade_valida check (quantidade > 0),
  constraint anuncios_status_valido check (status in ('Disponível', 'Reservada', 'Vendida')),
  constraint anuncios_cidade_valida check (
    char_length(btrim(cidade)) between 2 and 100 and cidade ~ '[^[:space:]]'
  ),
  constraint anuncios_bairro_valido check (
    char_length(btrim(bairro)) between 1 and 100 and bairro ~ '[^[:space:]]'
  )
);

create table public.anuncio_fotos (
  id uuid primary key default gen_random_uuid(),
  anuncio_id uuid not null references public.anuncios(id) on delete cascade,
  posicao smallint not null check (posicao between 1 and 3),
  caminho text not null unique,
  created_at timestamptz not null default now(),
  -- Limite garantido pelo banco, inclusive em inserções concorrentes.
  constraint anuncio_fotos_posicao_unica unique (anuncio_id, posicao)
);

create index anuncios_disponiveis_criados_idx on public.anuncios (created_at desc) where status = 'Disponível';
create index anuncios_marcenaria_idx on public.anuncios (marcenaria_id, created_at desc);
create index anuncios_busca_idx on public.anuncios (cidade, bairro, material) where status = 'Disponível';

alter table public.perfis enable row level security;
alter table public.anuncios enable row level security;
alter table public.anuncio_fotos enable row level security;
revoke all on table public.perfis, public.anuncios, public.anuncio_fotos from public, anon, authenticated;

-- Colunas de autoridade, identidade e datas nunca são graváveis pelo cliente.
grant select on public.perfis to authenticated;
grant update (nome, whatsapp, cidade, bairro) on public.perfis to authenticated;
grant select on public.anuncios, public.anuncio_fotos to anon, authenticated;
grant insert (material, espessura, acabamento, comprimento, largura, quantidade, preco,
              observacoes, cidade, bairro, status) on public.anuncios to authenticated;
grant update (material, espessura, acabamento, comprimento, largura, quantidade, preco,
              observacoes, cidade, bairro, status) on public.anuncios to authenticated;
grant delete on public.anuncios to authenticated;

-- Estas funções são SECURITY DEFINER para consultar perfis sem recursão nas
-- políticas; o proprietário da migração deve ser proprietário das tabelas e
-- estas não devem ser alteradas para FORCE ROW LEVEL SECURITY.
create function privado.usuario_ativo()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.perfis p where p.id = auth.uid() and p.ativo);
$$;

create function privado.eh_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.perfis p where p.id = auth.uid() and p.ativo and p.role = 'admin'
  );
$$;

create function privado.eh_marcenaria_ativa()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.perfis p where p.id = auth.uid() and p.ativo and p.role = 'marcenaria'
  );
$$;

create function privado.marcenaria_ativa(p_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.perfis p where p.id = p_id and p.ativo and p.role = 'marcenaria'
  );
$$;

revoke all on function privado.usuario_ativo(), privado.eh_admin(), privado.eh_marcenaria_ativa(),
  privado.marcenaria_ativa(uuid) from public, anon, authenticated;
grant execute on function privado.usuario_ativo(), privado.marcenaria_ativa(uuid) to anon, authenticated;
grant execute on function privado.eh_admin(), privado.eh_marcenaria_ativa() to authenticated;

create function privado.atualizar_data()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function privado.atualizar_data() from public, anon, authenticated;
create trigger perfis_atualizar_data before update on public.perfis
  for each row execute function privado.atualizar_data();
create trigger anuncios_atualizar_data before update on public.anuncios
  for each row execute function privado.atualizar_data();

-- Os únicos metadados aceitos para o perfil são strings de dados cadastrais.
-- role e ativo enviados pelo cliente são ignorados incondicionalmente.
create function privado.criar_perfil_auth()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  dados jsonb := new.raw_user_meta_data;
  v_nome text;
  v_telefone text;
  v_digitos text;
  v_cidade text;
  v_bairro text;
begin
  if jsonb_typeof(dados -> 'nome') is distinct from 'string'
     or jsonb_typeof(dados -> 'whatsapp') is distinct from 'string'
     or jsonb_typeof(dados -> 'cidade') is distinct from 'string'
     or jsonb_typeof(dados -> 'bairro') is distinct from 'string' then
    raise exception 'Cadastro exige nome, whatsapp, cidade e bairro como texto'
      using errcode = '22023';
  end if;

  v_nome := btrim(dados ->> 'nome');
  v_telefone := btrim(dados ->> 'whatsapp');
  v_cidade := btrim(dados ->> 'cidade');
  v_bairro := btrim(dados ->> 'bairro');
  if v_telefone !~ '^[+]?[0-9 ()-]+$' or char_length(v_telefone) > 40 then
    raise exception 'WhatsApp inválido' using errcode = '22023';
  end if;
  v_digitos := regexp_replace(v_telefone, '[^0-9]', '', 'g');
  if left(v_telefone, 1) = '+' then
    v_telefone := '+' || v_digitos;
  elsif char_length(v_digitos) in (10, 11) then
    v_telefone := '+55' || v_digitos;
  elsif char_length(v_digitos) in (12, 13) and left(v_digitos, 2) = '55' then
    v_telefone := '+' || v_digitos;
  else
    raise exception 'Informe WhatsApp com DDD ou código internacional' using errcode = '22023';
  end if;

  if char_length(v_nome) not between 2 and 120 or v_nome !~ '[^[:space:]]'
     or v_telefone !~ '^[+][1-9][0-9]{7,14}$'
     or char_length(v_cidade) not between 2 and 100 or v_cidade !~ '[^[:space:]]'
     or char_length(v_bairro) not between 1 and 100 or v_bairro !~ '[^[:space:]]' then
    raise exception 'Dados cadastrais inválidos' using errcode = '22023';
  end if;

  insert into public.perfis (id, nome, whatsapp, cidade, bairro, role, ativo)
  values (new.id, v_nome, v_telefone, v_cidade, v_bairro, 'marcenaria', true);
  return new;
end;
$$;
revoke all on function privado.criar_perfil_auth() from public, anon, authenticated;
create trigger auth_usuario_criar_perfil after insert on auth.users
  for each row execute function privado.criar_perfil_auth();

create policy perfis_ler_proprio_ou_admin on public.perfis for select to authenticated
  using (id = auth.uid() or privado.eh_admin());
create policy perfis_editar_proprio on public.perfis for update to authenticated
  using (privado.usuario_ativo() and id = auth.uid())
  with check (privado.usuario_ativo() and id = auth.uid());

create policy anuncios_ler_publicos_anon on public.anuncios for select to anon
  using (status = 'Disponível' and privado.marcenaria_ativa(marcenaria_id));
create policy anuncios_ler_autenticado on public.anuncios for select to authenticated
  using (
    privado.usuario_ativo() and (
      privado.marcenaria_ativa(marcenaria_id)
      or marcenaria_id = auth.uid() or privado.eh_admin()
    )
  );
create policy anuncios_criar_proprio on public.anuncios for insert to authenticated
  with check (privado.eh_marcenaria_ativa() and marcenaria_id = auth.uid());
create policy anuncios_editar_proprio on public.anuncios for update to authenticated
  using (privado.eh_marcenaria_ativa() and marcenaria_id = auth.uid())
  with check (privado.eh_marcenaria_ativa() and marcenaria_id = auth.uid());
create policy anuncios_excluir_proprio_ou_admin on public.anuncios for delete to authenticated
  using (
    privado.usuario_ativo() and (
      (privado.eh_marcenaria_ativa() and marcenaria_id = auth.uid()) or privado.eh_admin()
    )
  );

-- Projeção pública deliberadamente sem WhatsApp, e-mail ou outros dados privados.
-- A view é de propriedade do criador da migração e filtra explicitamente, pois
-- views convencionais executam com os privilégios de seu proprietário.
create view public.marcenarias_publicas with (security_barrier = true) as
select p.id, p.nome, p.cidade, p.bairro
from public.perfis p
where p.ativo and p.role = 'marcenaria'
  and (auth.role() = 'anon' or privado.usuario_ativo());
revoke all on table public.marcenarias_publicas from public, anon, authenticated;
grant select on public.marcenarias_publicas to anon, authenticated;

-- Visitantes veem apenas disponíveis; usuários ativos também podem filtrar
-- reservas e vendas de outras marcenarias ativas.
create view public.anuncios_publicos with (security_barrier = true) as
select a.id, a.marcenaria_id, a.material, a.espessura, a.acabamento,
       a.comprimento, a.largura, a.quantidade, a.preco, a.observacoes,
       a.cidade, a.bairro, a.status, a.created_at, a.updated_at,
       p.nome as marcenaria_nome
from public.anuncios a join public.perfis p on p.id = a.marcenaria_id
where p.ativo and p.role = 'marcenaria'
  and ((auth.role() = 'anon' and a.status = 'Disponível')
       or (auth.role() = 'authenticated' and privado.usuario_ativo()));
revoke all on table public.anuncios_publicos from public, anon, authenticated;
grant select on public.anuncios_publicos to anon, authenticated;

-- Seis posições permitem substituir três fotos sem apagar as anteriores antes
-- da confirmação. Apenas três posições podem ser vinculadas ao anúncio.
create function privado.caminho_do_usuario(p_caminho text, p_usuario uuid)
returns boolean language sql immutable set search_path = ''
as $$
  select p_caminho ~ (
    '^' || p_usuario::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[1-6]$'
  );
$$;
revoke all on function privado.caminho_do_usuario(text, uuid) from public, anon, authenticated;
grant execute on function privado.caminho_do_usuario(text, uuid) to authenticated;

-- Falhar fechado se o Storage não estiver com RLS habilitada.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects' and c.relrowsecurity
  ) then
    raise exception 'RLS deve estar habilitada em storage.objects';
  end if;
end;
$$;

-- Não reutilizar silenciosamente um bucket preexistente com esse nome.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anuncios-fotos', 'anuncios-fotos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp']);

create function privado.pode_vincular_foto(p_anuncio uuid, p_posicao smallint, p_caminho text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select privado.eh_marcenaria_ativa() and exists (
    select 1 from public.anuncios a
    join storage.objects o on o.bucket_id = 'anuncios-fotos' and o.name = p_caminho
    where a.id = p_anuncio and a.marcenaria_id = auth.uid()
      and p_posicao between 1 and 3
      and p_caminho ~ ('^' || a.marcenaria_id::text || '/' || a.id::text || '/[1-6]$')
  );
$$;
revoke all on function privado.pode_vincular_foto(uuid, smallint, text) from public, anon, authenticated;
grant execute on function privado.pode_vincular_foto(uuid, smallint, text) to authenticated;

-- SELECT do anúncio já aplica suas políticas, sem ciclo de RLS.
create policy fotos_ler_anuncio_visivel on public.anuncio_fotos for select to anon, authenticated
  using (exists (select 1 from public.anuncios a where a.id = anuncio_fotos.anuncio_id));
create policy fotos_vincular_proprias on public.anuncio_fotos for insert to authenticated
  with check (privado.pode_vincular_foto(anuncio_id, posicao, caminho));
create policy fotos_excluir_proprias_ou_admin on public.anuncio_fotos for delete to authenticated
  using (
    privado.usuario_ativo() and (
      privado.eh_admin() or exists (
        select 1 from public.anuncios a
        where a.id = anuncio_fotos.anuncio_id and a.marcenaria_id = auth.uid()
          and privado.eh_marcenaria_ativa()
      )
    )
  );

-- Só um objeto vinculado a um anúncio visível pode ser baixado publicamente.
create policy tem_estoque_fotos_ler_anon on storage.objects for select to anon
  using (
    bucket_id = 'anuncios-fotos' and exists (
      select 1 from public.anuncio_fotos f where f.caminho = objects.name
    )
  );
create policy tem_estoque_fotos_ler_autenticado on storage.objects for select to authenticated
  using (
    bucket_id = 'anuncios-fotos' and privado.usuario_ativo() and (
      privado.eh_admin() or privado.caminho_do_usuario(name, auth.uid())
      or exists (select 1 from public.anuncio_fotos f where f.caminho = objects.name)
    )
  );
create policy tem_estoque_fotos_enviar on storage.objects for insert to authenticated
  with check (
    bucket_id = 'anuncios-fotos' and privado.eh_marcenaria_ativa()
    and exists (
      select 1 from public.anuncios a
      where a.marcenaria_id = auth.uid()
        and name in (
          a.marcenaria_id::text || '/' || a.id::text || '/1',
          a.marcenaria_id::text || '/' || a.id::text || '/2',
          a.marcenaria_id::text || '/' || a.id::text || '/3',
          a.marcenaria_id::text || '/' || a.id::text || '/4',
          a.marcenaria_id::text || '/' || a.id::text || '/5',
          a.marcenaria_id::text || '/' || a.id::text || '/6'
        )
    )
  );
-- Nenhuma política de UPDATE: não usar upsert, mover ou renomear objetos.
-- A exclusão por prefixo próprio continua possível após apagar o anúncio,
-- permitindo remover arquivos órfãos usando a API do Storage.
create policy tem_estoque_fotos_excluir on storage.objects for delete to authenticated
  using (
    bucket_id = 'anuncios-fotos' and privado.usuario_ativo()
    and (privado.eh_admin() or privado.caminho_do_usuario(name, auth.uid()))
    and not exists (select 1 from public.anuncio_fotos f where f.caminho = objects.name)
  );

-- Políticas restritivas também limitam este bucket se já existirem políticas
-- permissivas genéricas em storage.objects; outros buckets não são alterados.
create policy tem_estoque_limite_leitura_anon on storage.objects as restrictive for select to anon
  using (
    bucket_id <> 'anuncios-fotos' or exists (
      select 1 from public.anuncio_fotos f where f.caminho = objects.name
    )
  );
create policy tem_estoque_limite_leitura_auth on storage.objects as restrictive for select to authenticated
  using (
    bucket_id <> 'anuncios-fotos' or (
      privado.usuario_ativo() and (
        privado.eh_admin() or privado.caminho_do_usuario(name, auth.uid())
        or exists (select 1 from public.anuncio_fotos f where f.caminho = objects.name)
      )
    )
  );
create policy tem_estoque_limite_envio_anon on storage.objects as restrictive for insert to anon
  with check (bucket_id <> 'anuncios-fotos');
create policy tem_estoque_limite_envio_auth on storage.objects as restrictive for insert to authenticated
  with check (
    bucket_id <> 'anuncios-fotos' or (
      privado.eh_marcenaria_ativa() and exists (
        select 1 from public.anuncios a
        where a.marcenaria_id = auth.uid()
          and objects.name in (
            a.marcenaria_id::text || '/' || a.id::text || '/1',
            a.marcenaria_id::text || '/' || a.id::text || '/2',
            a.marcenaria_id::text || '/' || a.id::text || '/3',
            a.marcenaria_id::text || '/' || a.id::text || '/4',
            a.marcenaria_id::text || '/' || a.id::text || '/5',
            a.marcenaria_id::text || '/' || a.id::text || '/6'
          )
      )
    )
  );
create policy tem_estoque_limite_atualizacao on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'anuncios-fotos') with check (bucket_id <> 'anuncios-fotos');
create policy tem_estoque_limite_exclusao_anon on storage.objects as restrictive for delete to anon
  using (bucket_id <> 'anuncios-fotos');
create policy tem_estoque_limite_exclusao_auth on storage.objects as restrictive for delete to authenticated
  using (
    bucket_id <> 'anuncios-fotos' or (
      privado.usuario_ativo() and (privado.eh_admin() or privado.caminho_do_usuario(name, auth.uid()))
      and not exists (select 1 from public.anuncio_fotos f where f.caminho = objects.name)
    )
  );

create function public.substituir_fotos(p_anuncio_id uuid, p_anteriores text[], p_caminhos text[])
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_atuais text[];
  v_caminho text;
  v_posicao smallint := 0;
begin
  perform 1 from public.anuncios a
    where a.id = p_anuncio_id and a.marcenaria_id = auth.uid()
      and privado.eh_marcenaria_ativa()
    for update;
  if not found then
    raise exception 'Anúncio não encontrado' using errcode = '42501';
  end if;
  select coalesce(array_agg(f.caminho order by f.posicao), array[]::text[])
    into v_atuais from public.anuncio_fotos f where f.anuncio_id = p_anuncio_id;
  if v_atuais is distinct from p_anteriores then
    raise exception 'As fotos foram alteradas em outra sessão' using errcode = '40001';
  end if;
  if p_caminhos is null or coalesce(array_length(p_caminhos, 1), 0) > 3 then
    raise exception 'É possível publicar no máximo três fotos' using errcode = '22023';
  end if;
  foreach v_caminho in array p_caminhos loop
    v_posicao := v_posicao + 1;
    if not privado.pode_vincular_foto(p_anuncio_id, v_posicao, v_caminho) then
      raise exception 'Foto inválida' using errcode = '22023';
    end if;
  end loop;
  delete from public.anuncio_fotos where anuncio_id = p_anuncio_id;
  v_posicao := 0;
  foreach v_caminho in array p_caminhos loop
    v_posicao := v_posicao + 1;
    insert into public.anuncio_fotos (anuncio_id, posicao, caminho)
      values (p_anuncio_id, v_posicao, v_caminho);
  end loop;
end;
$$;
revoke all on function public.substituir_fotos(uuid, text[], text[]) from public, anon, authenticated;
grant execute on function public.substituir_fotos(uuid, text[], text[]) to authenticated;

-- Um contato só é revelado a um usuário ativo. Terceiros só veem contato de
-- anúncio disponível de marcenaria ativa; proprietário e admin podem moderar.
create function public.contato_whatsapp(p_anuncio_id uuid)
returns table (nome text, whatsapp text, url_whatsapp text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not privado.usuario_ativo() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return query
    select p.nome, p.whatsapp,
           'https://wa.me/' || substr(p.whatsapp, 2)
    from public.anuncios a join public.perfis p on p.id = a.marcenaria_id
    where a.id = p_anuncio_id
      and (privado.eh_admin() or a.marcenaria_id = auth.uid()
           or (a.status = 'Disponível' and p.ativo and p.role = 'marcenaria'));
end;
$$;
revoke all on function public.contato_whatsapp(uuid) from public, anon, authenticated;
grant execute on function public.contato_whatsapp(uuid) to authenticated;

-- O e-mail atual é obtido de auth.users apenas para administradores ativos;
-- não é duplicado nos perfis nem exposto na projeção pública.
create function public.admin_usuarios()
returns table (
  id uuid, email text, nome text, whatsapp text, cidade text,
  bairro text, role text, ativo boolean, created_at timestamptz, updated_at timestamptz,
  email_confirmado_em timestamptz, ultimo_acesso_em timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not privado.eh_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return query
    select p.id, u.email::text, p.nome, p.whatsapp, p.cidade,
           p.bairro, p.role, p.ativo, p.created_at, p.updated_at,
           u.email_confirmed_at, u.last_sign_in_at
    from public.perfis p join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;
revoke all on function public.admin_usuarios() from public, anon, authenticated;
grant execute on function public.admin_usuarios() to authenticated;

create function public.admin_definir_ativo(p_usuario_id uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not privado.eh_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_usuario_id is null or p_ativo is null then
    raise exception 'Usuário e estado são obrigatórios' using errcode = '22023';
  end if;
  update public.perfis p set ativo = p_ativo
  where p.id = p_usuario_id and p.role = 'marcenaria';
  if not found then
    raise exception 'Marcenaria não encontrada' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.admin_definir_ativo(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_definir_ativo(uuid, boolean) to authenticated;

create function public.admin_contagens()
returns table (
  marcenarias_total bigint, marcenarias_ativas bigint, marcenarias_inativas bigint,
  anuncios_total bigint, anuncios_disponiveis bigint, anuncios_indisponiveis bigint,
  anuncios_publicos bigint, fotos_total bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not privado.eh_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return query
    select
      (select count(*) from public.perfis p where p.role = 'marcenaria'),
      (select count(*) from public.perfis p where p.role = 'marcenaria' and p.ativo),
      (select count(*) from public.perfis p where p.role = 'marcenaria' and not p.ativo),
      (select count(*) from public.anuncios),
      (select count(*) from public.anuncios a where a.status = 'Disponível'),
      (select count(*) from public.anuncios a where a.status <> 'Disponível'),
      (select count(*) from public.anuncios a join public.perfis p on p.id = a.marcenaria_id
       where a.status = 'Disponível' and p.ativo and p.role = 'marcenaria'),
      (select count(*) from public.anuncio_fotos);
end;
$$;
revoke all on function public.admin_contagens() from public, anon, authenticated;
grant execute on function public.admin_contagens() to authenticated;

commit;
