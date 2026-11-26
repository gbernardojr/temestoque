import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  ImageOff,
  MapPin,
  ShoppingCart,
  PackageOpen,
  Search,
  SlidersHorizontal,
} from 'lucide-react';

const AVAILABLE = 'Disponível';
const STATUSES = [AVAILABLE, 'Reservada', 'Vendida'];
const FILTER_FIELDS = [
  'material',
  'espessura',
  'acabamento',
  'cidade',
  'bairro',
  'comprimento',
  'largura',
  'status',
];

const priceFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const numberFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 20,
});
const dateFormatter = new Intl.DateTimeFormat('pt-BR');

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function displayValue(value, fallback = 'Não informado') {
  if (!hasValue(value)) return fallback;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? numberFormatter.format(value) : fallback;
  }
  return String(value).trim();
}

function formatPrice(price) {
  return typeof price === 'number' && Number.isFinite(price)
    ? priceFormatter.format(price)
    : 'Valor a combinar';
}

function formatDate(value) {
  if (!hasValue(value)) return 'Não informada';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Não informada' : dateFormatter.format(date);
}

function dateValue(value) {
  if (!hasValue(value)) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function measurementNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (!hasValue(value)) return null;
  let text = String(value).trim().replace(/\s*(mm|cm|m)$/i, '');
  if (!/^[+-]?(?:\d+(?:[.,]\d+)*|[.,]\d+)$/.test(text)) return null;
  if (text.includes(',') && text.includes('.')) text = text.replace(/\./g, '');
  text = text.replace(',', '.');
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function canonicalStatus(value) {
  const normalized = normalize(value);
  if (!normalized) return AVAILABLE;
  if (normalized === 'todos') return 'todos';
  return STATUSES.find((status) => normalize(status) === normalized) || String(value).trim();
}

function readFilters(params) {
  return {
    material: params.get('material') || '',
    espessura: params.get('espessura') || '',
    acabamento: params.get('acabamento') || '',
    cidade: params.get('cidade') || '',
    bairro: params.get('bairro') || '',
    comprimento: params.get('comprimento') || '',
    largura: params.get('largura') || '',
    status: canonicalStatus(params.get('status')),
  };
}

function isOwnListing(listing, currentUserId) {
  return (
    hasValue(currentUserId) &&
    hasValue(listing?.user_id) &&
    String(listing.user_id) === String(currentUserId)
  );
}

function statusClass(status) {
  switch (normalize(status)) {
    case 'disponivel':
      return 'available';
    case 'reservada':
    case 'reservado':
      return 'reserved';
    case 'vendida':
    case 'vendido':
      return 'sold';
    default:
      return '';
  }
}

function photosOf(listing) {
  return Array.isArray(listing?.fotos)
    ? listing.fotos.filter((photo) => photo && typeof photo.url === 'string' && photo.url.trim())
    : [];
}

function StatusBadge({ status }) {
  return (
    <span className={`badge ${statusClass(status)}`.trim()}>
      {displayValue(status, 'Status não informado')}
    </span>
  );
}

function ListingPhoto({ url, alt, className }) {
  const [failed, setFailed] = useState(false);
  const showImage = hasValue(url) && !failed;

  return (
    <div
      className={`${className}${showImage ? '' : ' image-fallback'}`}
      style={className === 'thumbnail-image' ? { position: 'relative', width: '100%', height: '100%' } : undefined}
    >
      {showImage ? (
        <img src={url} alt={alt} onError={() => setFailed(true)} />
      ) : (
        <span
          className="image-fallback-content"
          role={alt ? 'img' : undefined}
          aria-label={alt ? 'Foto indisponível' : undefined}
          aria-hidden={alt ? undefined : true}
          style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#52685a', textAlign: 'center' }}
        >
          <ImageOff aria-hidden="true" />
          {className !== 'thumbnail-image' && <span>Foto indisponível</span>}
        </span>
      )}
    </div>
  );
}

function TextField({ id, label, name, value, onChange, type = 'text', ...props }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      <input
        className="field-input"
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        {...props}
      />
    </div>
  );
}

function CatalogState({ loading, configError, unavailable, empty, emptyMessage }) {
  if (configError) {
    return <div className="alert error" role="alert">{configError}</div>;
  }
  if (loading) {
    return <div className="empty-state" role="status">Carregando anúncios...</div>;
  }
  if (unavailable) {
    return <div className="alert info" role="status">Os anúncios estão indisponíveis no momento.</div>;
  }
  if (empty) {
    return (
      <div className="empty-state" role="status">
        <PackageOpen aria-hidden="true" />
        <p>{emptyMessage}</p>
      </div>
    );
  }
  return null;
}

export function ListingCard({ listing }) {
  if (!listing) return null;
  const photo = photosOf(listing)[0];
  const title = displayValue(listing.material, 'Material não informado');
  const location = [listing.bairro, listing.cidade].filter(hasValue).join(', ');
  const detailsUrl = `/sobras/${encodeURIComponent(String(listing.id))}`;

  return (
    <article className="listing-card">
      <ListingPhoto
        key={photo?.url || 'sem-foto'}
        url={photo?.url}
        alt={`Foto de ${title}`}
        className="listing-image"
      />
      <div className="listing-content">
        <div className="listing-top">
          <StatusBadge status={listing.status} />
          <span className="listing-price">{formatPrice(listing.preco)}</span>
        </div>
        <h3 className="listing-title">{title}</h3>
        <div className="listing-meta">
          <p>Espessura: {displayValue(listing.espessura)} mm</p>
          <p>Cor / acabamento: {displayValue(listing.acabamento)}</p>
          <p>Medidas: {displayValue(listing.comprimento)} × {displayValue(listing.largura)} cm</p>
          <p>Quantidade: {displayValue(listing.quantidade)}</p>
          <p><MapPin size={16} aria-hidden="true" /> {location || 'Localização não informada'}</p>
        </div>
        <div className="listing-footer">
          <Link className="button outline" to={detailsUrl}>
            Ver detalhes <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function HomePage({ listings, loading, configError, signedIn }) {
  const navigate = useNavigate();
  const recentListings = useMemo(() => {
    if (!Array.isArray(listings)) return [];
    return listings
      .filter((listing) => listing && normalize(listing.status) === normalize(AVAILABLE))
      .slice()
      .sort((a, b) => dateValue(b.created_at) - dateValue(a.created_at))
      .slice(0, 6);
  }, [listings]);

  function handleQuickSearch(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    ['material', 'espessura', 'acabamento', 'cidade'].forEach((field) => {
      const value = String(form.get(field) || '').trim();
      if (value) params.set(field, value);
    });
    const query = params.toString();
    navigate(query ? `/buscar?${query}` : '/buscar');
  }

  const showListings = !loading && !configError && Array.isArray(listings) && recentListings.length > 0;

  return (
    <main>
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-copy">
            <span className="eyebrow">Conexões locais. Novas possibilidades.</span>
            <h1 className="hero-title">Tem Estoque</h1>
            <p>Encontre sobras de chapas perto de você antes de comprar uma chapa nova.</p>
            <div className="hero-actions">
              {signedIn ? <>
                <Link className="button primary" to="/buscar">Encontrar sobras <ArrowRight size={18} aria-hidden="true" /></Link>
                <Link className="button outline" to="/minhas-sobras">Minha conta</Link>
              </> : <>
                <Link className="button primary" to="/buscar">Encontrar sobras <ArrowRight size={18} aria-hidden="true" /></Link>
                <Link className="button outline" to="/cadastro">Criar conta</Link>
              </>}
            </div>
            <p className="hero-note">Bom para a sua marcenaria. Melhor para o planeta.</p>
          </div>
          <div className="hero-image">
            <img src="/marcenaria.webp" alt="Ilustração de uma oficina com peças de madeira" />
          </div>
        </div>
      </section>

      <div className="page-container">
        <section className="search-panel" aria-labelledby="quick-search-title">
          <h2 className="search-title" id="quick-search-title">Encontre o que você precisa</h2>
          <form onSubmit={handleQuickSearch}>
            <div className="search-grid">
              <TextField id="quick-material" name="material" label="Material" placeholder="Ex.: MDF" />
              <TextField id="quick-espessura" name="espessura" label="Espessura" placeholder="Ex.: 18" />
              <TextField id="quick-acabamento" name="acabamento" label="Cor / acabamento" placeholder="Ex.: branco" />
              <TextField id="quick-cidade" name="cidade" label="Cidade" placeholder="Sua cidade" />
              <button className="button primary" type="submit"><Search size={18} aria-hidden="true" /> Buscar sobras</button>
            </div>
          </form>
        </section>

        <section className="section" aria-labelledby="recent-listings-title">
          <div className="section-header">
            <div>
              <span className="eyebrow">Materiais disponíveis</span>
              <h2 className="section-title" id="recent-listings-title">Sobras mais recentes</h2>
              <p className="section-subtitle">Confira os anúncios disponíveis mais recentes.</p>
            </div>
            <Link className="button outline" to="/buscar">Ver todas <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <CatalogState
            loading={loading}
            configError={configError}
            unavailable={!Array.isArray(listings)}
            empty={recentListings.length === 0}
            emptyMessage="Ainda não há sobras disponíveis."
          />
          {showListings && <div className="listing-grid">{recentListings.map((listing) => <ListingCard key={listing.id} listing={listing} />)}</div>}
        </section>
      </div>
    </main>
  );
}

export function SearchPage({ listings, loading, configError, currentUserId }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchKey = searchParams.toString();
  const filters = useMemo(() => readFilters(new URLSearchParams(searchKey)), [searchKey]);
  const [draft, setDraft] = useState(filters);

  useEffect(() => {
    setDraft(readFilters(new URLSearchParams(searchKey)));
  }, [searchKey]);

  const eligibleListings = useMemo(() => (
    Array.isArray(listings)
      ? listings.filter((listing) => listing && !isOwnListing(listing, currentUserId))
      : []
  ), [listings, currentUserId]);

  const statusOptions = useMemo(() => {
    const options = [AVAILABLE];
    eligibleListings.forEach((listing) => {
      if (hasValue(listing.status) && !options.some((status) => normalize(status) === normalize(listing.status))) {
        options.push(String(listing.status).trim());
      }
    });
    return options;
  }, [eligibleListings]);

  const invalidMeasurements = ['comprimento', 'largura'].some((field) => {
    if (!hasValue(filters[field])) return false;
    const value = measurementNumber(filters[field]);
    return value === null || value < 0;
  });

  const results = useMemo(() => {
    if (invalidMeasurements) return [];
    return eligibleListings.filter((listing) => {
      for (const field of ['material', 'acabamento', 'cidade', 'bairro']) {
        if (hasValue(filters[field]) && !normalize(listing[field]).includes(normalize(filters[field]))) return false;
      }
      if (hasValue(filters.espessura)) {
        const wanted = measurementNumber(filters.espessura);
        const actual = measurementNumber(listing.espessura);
        if (wanted !== null && actual !== null) {
          if (actual !== wanted) return false;
        } else if (!normalize(listing.espessura).includes(normalize(filters.espessura))) {
          return false;
        }
      }
      for (const field of ['comprimento', 'largura']) {
        if (hasValue(filters[field])) {
          const actual = measurementNumber(listing[field]);
          if (actual === null || actual < measurementNumber(filters[field])) return false;
        }
      }
      return filters.status === 'todos' || normalize(listing.status) === normalize(filters.status);
    }).slice().sort((a, b) => dateValue(b.created_at) - dateValue(a.created_at));
  }, [eligibleListings, filters, invalidMeasurements]);

  function updateDraft(event) {
    const { name, value } = event.target;
    setDraft((previous) => ({ ...previous, [name]: value }));
  }

  function handleSearch(event) {
    event.preventDefault();
    const params = new URLSearchParams();
    FILTER_FIELDS.forEach((field) => {
      const value = String(draft[field] || '').trim();
      if (value) params.set(field, value);
    });
    setSearchParams(params);
  }

  function clearFilters() {
    setDraft(readFilters(new URLSearchParams()));
    setSearchParams(new URLSearchParams());
  }

  const showResults = !loading && !configError && Array.isArray(listings);
  const matchingStatus = statusOptions.find((status) => normalize(status) === normalize(draft.status));
  const statusIsMissing = draft.status !== 'todos' && !matchingStatus;
  const selectedStatus = matchingStatus || draft.status;

  return (
    <main className="page-container">
      <header className="page-heading">
        <span className="eyebrow">Encontre materiais</span>
        <h1>Buscar sobras</h1>
        <p>Filtre os anúncios para encontrar materiais para o seu projeto.</p>
      </header>

      <section className="panel search-panel" aria-labelledby="filters-title">
        <h2 className="search-title" id="filters-title"><SlidersHorizontal size={20} aria-hidden="true" /> Filtros de busca</h2>
        <form onSubmit={handleSearch}>
          <div className="search-grid">
            <TextField id="filter-material" name="material" label="Material" value={draft.material} onChange={updateDraft} />
            <TextField id="filter-espessura" name="espessura" label="Espessura" value={draft.espessura} onChange={updateDraft} />
            <TextField id="filter-acabamento" name="acabamento" label="Cor / acabamento" value={draft.acabamento} onChange={updateDraft} />
            <TextField id="filter-cidade" name="cidade" label="Cidade" value={draft.cidade} onChange={updateDraft} />
            <TextField id="filter-bairro" name="bairro" label="Bairro" value={draft.bairro} onChange={updateDraft} />
            <TextField id="filter-comprimento" name="comprimento" label="Comprimento mínimo" inputMode="decimal" value={draft.comprimento} onChange={updateDraft} />
            <TextField id="filter-largura" name="largura" label="Largura mínima" inputMode="decimal" value={draft.largura} onChange={updateDraft} />
            <div className="field">
              <label className="field-label" htmlFor="filter-status">Status</label>
              <select className="field-input" id="filter-status" name="status" value={selectedStatus} onChange={updateDraft}>
                {statusIsMissing && <option value={selectedStatus}>Status informado{showResults ? ' não encontrado' : ''}</option>}
                {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                <option value="todos">Todos os status</option>
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button className="button primary" type="submit"><Search size={18} aria-hidden="true" /> Buscar</button>
            <button className="button outline" type="button" onClick={clearFilters}>Limpar filtros</button>
          </div>
        </form>
      </section>

      <section className="section" aria-labelledby="search-results-title">
        <div className="section-header">
          <div>
            <h2 className="section-title" id="search-results-title">Resultados da busca</h2>
            {showResults && !invalidMeasurements && (
              <p className="section-subtitle" aria-live="polite">
                {results.length === 1 ? '1 anúncio encontrado' : `${results.length} anúncios encontrados`}
              </p>
            )}
          </div>
        </div>
        {showResults && invalidMeasurements && <div className="alert error" role="alert">Confira as medidas mínimas informadas.</div>}
        <CatalogState
          loading={loading}
          configError={configError}
          unavailable={!Array.isArray(listings)}
          empty={!invalidMeasurements && results.length === 0}
          emptyMessage="Nenhum anúncio encontrado para esses filtros. Tente ajustar sua busca."
        />
        {showResults && results.length > 0 && <div className="listing-grid">{results.map((listing) => <ListingCard key={listing.id} listing={listing} />)}</div>}
      </section>
    </main>
  );
}

function Spec({ label, value }) {
  return (
    <div className="spec">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function DetailsPage({ listing, loading, onReserve, currentUserId, signedIn, reserving, reserveError, configError }) {
  const [activePhoto, setActivePhoto] = useState(0);
  const listingId = listing?.id;

  useEffect(() => {
    setActivePhoto(0);
  }, [listingId]);

  if (configError) {
    return <main className="page-container"><div className="alert error" role="alert">Não foi possível carregar os detalhes. Tente novamente mais tarde.</div></main>;
  }
  if (loading) {
    return <main className="page-container"><div className="empty-state" role="status">Carregando detalhes...</div></main>;
  }
  if (!listing) {
    return (
      <main className="page-container">
        <div className="empty-state" role="status">
          <PackageOpen aria-hidden="true" />
          <p>Não foi possível encontrar esta sobra.</p>
          <Link className="button outline" to="/buscar">Voltar para a busca</Link>
        </div>
      </main>
    );
  }

  const photos = photosOf(listing);
  const selectedIndex = activePhoto < photos.length ? activePhoto : 0;
  const selectedPhoto = photos[selectedIndex];
  const title = displayValue(listing.material, 'Material não informado');
  const ownListing = isOwnListing(listing, currentUserId);

  return (
    <main className="page-container">
      <div className="page-heading">
        <Link className="back-link" to="/buscar">← Voltar para a busca</Link>
      </div>
      <div className="details-layout">
        <section className="details-gallery" aria-label="Fotos da sobra">
          <ListingPhoto
            key={selectedPhoto?.url || 'sem-foto'}
            url={selectedPhoto?.url}
            alt={selectedPhoto ? `Foto ${selectedIndex + 1} de ${title}` : `Foto de ${title}`}
            className="details-main-image"
          />
          {photos.length > 1 && (
            <div className="thumbnails" aria-label="Escolher foto">
              {photos.map((photo, index) => (
                <button
                  className={`thumbnail${index === selectedIndex ? ' active' : ''}`}
                  type="button"
                  key={`${photo.path || photo.url}-${index}`}
                  aria-label={`Ver foto ${index + 1} de ${photos.length}`}
                  aria-pressed={index === selectedIndex}
                  onClick={() => setActivePhoto(index)}
                >
                  <ListingPhoto key={photo.url} url={photo.url} alt="" className="thumbnail-image" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="details-info panel" aria-labelledby="details-title">
          <StatusBadge status={listing.status} />
          <h1 id="details-title">{title}</h1>
          <p className="details-price">{formatPrice(listing.preco)}</p>
          <p className="details-seller">Ofertante: {displayValue(listing.marcenaria_nome)}</p>
          <h2>Informações da sobra</h2>
          <dl className="specs-grid">
            <Spec label="Material" value={title} />
            <Spec label="Espessura" value={`${displayValue(listing.espessura)} mm`} />
            <Spec label="Cor / acabamento" value={displayValue(listing.acabamento)} />
            <Spec label="Comprimento" value={`${displayValue(listing.comprimento)} cm`} />
            <Spec label="Largura" value={`${displayValue(listing.largura)} cm`} />
            <Spec label="Quantidade" value={displayValue(listing.quantidade)} />
            <Spec label="Cidade" value={displayValue(listing.cidade)} />
            <Spec label="Bairro" value={displayValue(listing.bairro)} />
            <Spec label="Status" value={displayValue(listing.status)} />
            <Spec label="Publicado em" value={formatDate(listing.created_at)} />
            <Spec label="Código do anúncio" value={displayValue(listing.id)} />
          </dl>
          <div className="details-observations">
            <h2>Observações</h2>
            <p>{displayValue(listing.observacoes, 'Nenhuma observação informada.')}</p>
          </div>
          {ownListing && <div className="notice">Esta sobra é sua.</div>}
          {!ownListing && listing.status !== AVAILABLE && <div className="notice">Esta sobra não está disponível no momento.</div>}
          {reserveError && <div className="alert error" role="alert">{reserveError}</div>}
          <button
            className="button primary"
            type="button"
            disabled={ownListing || reserving || listing.status !== AVAILABLE}
            onClick={() => onReserve(listing)}
          >
            <ShoppingCart size={20} aria-hidden="true" /> {reserving ? 'Reservando...' : signedIn ? 'Adicionar ao carrinho' : 'Entrar para adicionar ao carrinho'}
          </button>
          {!ownListing && <p className="muted">Ao adicionar, a sobra fica reservada para você. Negocie com o ofertante pelo chat no carrinho.</p>}
        </section>
      </div>
    </main>
  );
}
