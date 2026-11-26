import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ImagePlus,
  ImageOff,
  LogIn,
  Package,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';

const STATUSES = ['Disponível', 'Reservada', 'Vendida'];
const MATERIALS = ['MDF', 'MDP', 'Compensado', 'Melamínico', 'OSB', 'Madeira maciça', 'Vidro', 'Acrílico', 'Outro'];
const FINISHES = ['Branco', 'Cru', 'Preto', 'Madeirado', 'Colorido', 'Outro'];
const MAX_PHOTOS = 3;
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const MAX_PRICE_CENTS = 999999999999n;

function priceCalculations(value, rate) {
  if (value === null || String(value).trim() === '') return null;
  const price = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100 || !Number.isFinite(price) || price < 0 ||
      Math.abs(Math.round(price * 100) - price * 100) > 0.000001) return null;
  const baseCents = BigInt(Math.round(price * 100));
  const rateBasisPoints = BigInt(Math.round(rate * 100));
  const finalCents = (baseCents * (10000n + rateBasisPoints) + 5000n) / 10000n;
  if (finalCents > MAX_PRICE_CENTS) return null;
  const commissionCents = (finalCents * rateBasisPoints + 5000n) / 10000n;
  return { finalCents, commissionCents, payoutCents: finalCents - commissionCents };
}

function errorMessage(error, fallback) {
  return typeof error?.message === 'string' && error.message.trim()
    ? error.message
    : fallback;
}

function normalizeStatus(status) {
  return String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function statusClass(status) {
  switch (normalizeStatus(status)) {
    case 'disponivel':
      return 'available';
    case 'reservada':
      return 'reserved';
    case 'vendida':
      return 'sold';
    default:
      return '';
  }
}

function StatusBadge({ status }) {
  return <span className={`badge ${statusClass(status)}`}>{status || 'Status não informado'}</span>;
}

function formatDate(value) {
  if (!value) return 'Data não informada';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Data não informada'
    : date.toLocaleDateString('pt-BR');
}

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return null;
  const price = Number(value);
  if (!Number.isFinite(price)) return null;
  return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function Alert({ children, type = 'error' }) {
  if (!children) return null;
  return <div className={`alert ${type}`} role={type === 'error' ? 'alert' : 'status'}>{children}</div>;
}

function ListingImage({ listing }) {
  const photo = Array.isArray(listing.fotos) && listing.fotos.find((item) => item?.url);
  return photo ? (
    <img className="manage-image" src={photo.url} alt={`Foto de ${listing.material || 'anúncio'}`} />
  ) : (
    <div className="manage-image" aria-label="Anúncio sem foto">
      <ImageOff aria-hidden="true" />
      <span>Sem foto</span>
    </div>
  );
}

function ListingDetails({ listing }) {
  const price = formatPrice(listing.preco);
  return (
    <>
      <h3>{listing.material || 'Material não informado'}</h3>
      <StatusBadge status={listing.status} />
      {listing.marcenaria_nome && <p>Marcenaria: {listing.marcenaria_nome}</p>}
      {(listing.espessura !== null && listing.espessura !== undefined && listing.espessura !== '') && (
        <p>Espessura: {listing.espessura} mm</p>
      )}
      {(listing.comprimento !== null && listing.comprimento !== undefined && listing.comprimento !== '') &&
        (listing.largura !== null && listing.largura !== undefined && listing.largura !== '') && (
        <p>Dimensões: {listing.comprimento} × {listing.largura} cm</p>
      )}
      {(listing.quantidade !== null && listing.quantidade !== undefined && listing.quantidade !== '') && (
        <p>Quantidade: {listing.quantidade}</p>
      )}
      {price && <p>Preço: {price}</p>}
      <p className="muted">Publicado em: {formatDate(listing.created_at)}</p>
    </>
  );
}

export function LoginPage({ onLogin }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await onLogin({ email: form.email.trim(), password: form.password });
      navigate(location.state?.from || '/minhas-sobras');
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível entrar. Tente novamente.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-side">
        <h1>Tem Estoque</h1>
        <p>Entre para gerenciar suas sobras de materiais.</p>
      </section>
      <section className="auth-card" aria-labelledby="login-title">
        <h2 id="login-title">Entrar</h2>
        <p className="muted">Acesse sua conta para oferecer ou reservar sobras.</p>
        {location.state?.reason === 'cart' && <Alert type="info">Entre ou crie uma conta para adicionar esta sobra ao carrinho.</Alert>}
        <Alert>{error}</Alert>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="login-email">E-mail</label>
            <input className="field-input" id="login-email" name="email" type="email" autoComplete="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="login-password">Senha</label>
            <input className="field-input" id="login-password" name="password" type="password" autoComplete="current-password" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </div>
          <button className="button primary" type="submit" disabled={submitting}>
            <LogIn size={18} aria-hidden="true" /> {submitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
        <p>Não tem conta? <Link className="text-link" to="/cadastro" state={location.state}>Criar conta</Link></p>
      </section>
    </div>
  );
}

export function RegisterPage({ onSignup }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ nome: '', email: '', password: '', confirmPassword: '', whatsapp: '', cidade: '', bairro: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmationRequired, setConfirmationRequired] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setError('');
    if (form.nome.trim().length < 2 || form.nome.trim().length > 120 || form.cidade.trim().length < 2 || form.cidade.trim().length > 100 || !form.bairro.trim() || form.bairro.trim().length > 100) {
      setError('Confira o nome, a cidade e o bairro.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    const digits = form.whatsapp.replace(/\D/g, '');
    if (!/^[+]?[0-9 ()-]+$/.test(form.whatsapp) || !((digits.length === 10 || digits.length === 11) || (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)))) {
      setError('Informe um WhatsApp válido com DDD.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await onSignup({
        nome: form.nome.trim(),
        email: form.email.trim(),
        password: form.password,
        whatsapp: form.whatsapp.trim(),
        cidade: form.cidade.trim(),
        bairro: form.bairro.trim(),
      });
      if (result?.confirmationRequired) {
        setConfirmationRequired(true);
        setForm((current) => ({ ...current, password: '' }));
      } else {
        navigate(location.state?.from || '/minhas-sobras');
      }
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível realizar o cadastro. Tente novamente.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-side">
        <h1>Tem Estoque</h1>
        <p>Crie sua conta para oferecer e reservar sobras.</p>
      </section>
      <section className="auth-card" aria-labelledby="register-title">
        <h2 id="register-title">Cadastro</h2>
        {confirmationRequired ? (
          <>
            <Alert type="success">Cadastro realizado. Confirme seu e-mail antes de entrar.</Alert>
            <button className="button primary" type="button" onClick={() => navigate('/entrar', { state: location.state })}>
              <LogIn size={18} aria-hidden="true" /> Ir para login
            </button>
          </>
        ) : (
          <>
            <p className="muted">Informe seus dados ou os da sua marcenaria.</p>
            <Alert>{error}</Alert>
            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="field">
                <label className="field-label" htmlFor="register-nome">Seu nome ou nome da marcenaria</label>
                <input className="field-input" id="register-nome" name="nome" autoComplete="name" required value={form.nome} onChange={updateField} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="register-email">E-mail</label>
                <input className="field-input" id="register-email" name="email" type="email" autoComplete="email" required value={form.email} onChange={updateField} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="register-password">Senha</label>
                <input className="field-input" id="register-password" name="password" type="password" autoComplete="new-password" minLength="8" required value={form.password} onChange={updateField} />
                <small className="muted">Mínimo de 8 caracteres.</small>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="register-confirm-password">Confirmar senha</label>
                <input className="field-input" id="register-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength="8" required value={form.confirmPassword} onChange={updateField} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="register-whatsapp">WhatsApp com DDD</label>
                <input className="field-input" id="register-whatsapp" name="whatsapp" type="tel" autoComplete="tel" required aria-describedby="register-whatsapp-help" value={form.whatsapp} onChange={updateField} />
                <small className="muted" id="register-whatsapp-help">Exemplo: (11) 99999-9999.</small>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="register-cidade">Cidade</label>
                <input className="field-input" id="register-cidade" name="cidade" autoComplete="address-level2" required value={form.cidade} onChange={updateField} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="register-bairro">Bairro</label>
                <input className="field-input" id="register-bairro" name="bairro" autoComplete="address-level3" required value={form.bairro} onChange={updateField} />
              </div>
              <button className="button primary" type="submit" disabled={submitting}>
                <UserPlus size={18} aria-hidden="true" /> {submitting ? 'Cadastrando...' : 'Criar conta'}
              </button>
            </form>
            <p>Já tem conta? <Link className="text-link" to="/entrar" state={location.state}>Entrar</Link></p>
          </>
        )}
      </section>
    </div>
  );
}

export function MyListingsPage({ listings, loading, onStatusChange, onDelete }) {
  const [filter, setFilter] = useState('todos');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const items = Array.isArray(listings) ? listings : [];
  const filtered = filter === 'todos'
    ? items
    : items.filter((listing) => normalizeStatus(listing.status) === normalizeStatus(filter));

  async function changeStatus(listing, status) {
    if (pending || status === listing.status) return;
    setError('');
    setPending({ id: listing.id, type: 'status', status });
    try {
      await onStatusChange(listing.id, status);
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível alterar o status do anúncio.'));
    } finally {
      setPending(null);
    }
  }

  async function deleteListing(listing) {
    if (pending || !window.confirm('Deseja excluir este anúncio?')) return;
    setError('');
    setPending({ id: listing.id, type: 'delete' });
    try {
      await onDelete(listing.id);
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível excluir o anúncio.'));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <h1>Minhas sobras</h1>
          <p className="muted">Gerencie seus anúncios.</p>
        </div>
        <Link className="button primary" to="/sobras/nova"><Plus size={18} aria-hidden="true" /> Cadastrar nova sobra</Link>
      </div>
      <Alert>{error}</Alert>
      {loading ? (
        <p className="loading" role="status">Carregando anúncios...</p>
      ) : (
        <>
          <div className="field">
            <label className="field-label" htmlFor="listing-filter">Filtrar por status</label>
            <select className="field-input" id="listing-filter" value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="todos">Todos os status</option>
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <Package aria-hidden="true" />
              <p>{items.length === 0 ? 'Você ainda não tem anúncios.' : 'Nenhum anúncio encontrado para este status.'}</p>
            </div>
          ) : (
            <div className="list-stack">
              {filtered.map((listing) => {
                const status = pending?.id === listing.id && pending.type === 'status' ? pending.status : (listing.status || '');
                const hasKnownStatus = STATUSES.some((option) => option === status);
                return (
                  <article className="manage-card" key={listing.id}>
                    <ListingImage listing={listing} />
                    <div className="manage-content">
                      <ListingDetails listing={listing} />
                      {listing.reservada_em_carrinho ? (
                        <div className="manage-actions"><span className="notice">Reservada no carrinho de um interessado.</span><Link className="button outline small" to="/negociacoes">Ver negociação</Link></div>
                      ) : (
                        <div className="manage-actions">
                          <div className="field">
                            <label className="field-label" htmlFor={`status-${listing.id}`}>Alterar status</label>
                            <select className="field-input" id={`status-${listing.id}`} aria-label={`Alterar status do anúncio de ${listing.material || 'material'}`} value={status} disabled={Boolean(pending)} onChange={(event) => changeStatus(listing, event.target.value)}>
                              {!hasKnownStatus && <option value={status}>{status || 'Selecione um status'}</option>}
                              {STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
                            </select>
                          </div>
                          <Link className="button outline small" to={`/sobras/${encodeURIComponent(listing.id)}/editar`} aria-label={`Editar anúncio de ${listing.material || 'material'}`}><Pencil size={16} aria-hidden="true" /> Editar</Link>
                          <button className="button danger small" type="button" disabled={Boolean(pending)} onClick={() => deleteListing(listing)} aria-label={`Excluir anúncio de ${listing.material || 'material'}`}>
                            <Trash2 size={16} aria-hidden="true" /> {pending?.id === listing.id && pending.type === 'delete' ? 'Excluindo...' : 'Excluir'}
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function makeListingForm(initial, profile, isEdit) {
  return {
    material: initial?.material ?? '',
    espessura: initial?.espessura ?? '',
    acabamento: initial?.acabamento ?? '',
    comprimento: initial?.comprimento ?? '',
    largura: initial?.largura ?? '',
    quantidade: initial?.quantidade ?? '',
    preco: initial?.preco ?? '',
    observacoes: initial?.observacoes ?? '',
    cidade: initial?.cidade ?? profile?.cidade ?? '',
    bairro: initial?.bairro ?? profile?.bairro ?? '',
    status: isEdit ? (initial?.status || 'Disponível') : 'Disponível',
  };
}

export function ListingFormPage({ initial, profile, onSave, isEdit, commissionRate }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(() => makeListingForm(initial, profile, isEdit));
  const [negotiable, setNegotiable] = useState(initial?.preco == null);
  const [existingPhotos, setExistingPhotos] = useState(() => Array.isArray(initial?.fotos) ? initial.fotos : []);
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [removedPaths, setRemovedPaths] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const price = negotiable ? null : Number(form.preco);
  const samePrice = isEdit && (negotiable ? initial?.preco == null : initial?.preco != null && price === Number(initial.preco));
  const rate = samePrice ? Number(initial.comissao_percentual) : Number(commissionRate);
  const calculations = negotiable ? null : priceCalculations(form.preco, rate);

  useEffect(() => {
    setForm(makeListingForm(initial, profile, isEdit));
    setNegotiable(initial?.preco == null);
    setExistingPhotos(Array.isArray(initial?.fotos) ? initial.fotos : []);
    setFiles([]);
    setRemovedPaths([]);
    setError('');
  }, [initial?.id, isEdit]);

  useEffect(() => {
    if (isEdit || initial) return;
    setForm((current) => ({
      ...current,
      cidade: current.cidade || profile?.cidade || '',
      bairro: current.bairro || profile?.bairro || '',
    }));
  }, [isEdit, initial, profile?.cidade, profile?.bairro]);

  useEffect(() => {
    const nextPreviews = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(nextPreviews);
    return () => nextPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [files]);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function addPhotos(event) {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selected.length) return;
    if (existingPhotos.length + files.length + selected.length > MAX_PHOTOS) {
      setError('Você pode adicionar no máximo 3 fotos.');
      return;
    }
    const invalidType = selected.find((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    if (invalidType) {
      setError(`A foto "${invalidType.name}" deve ser JPG, PNG ou WebP.`);
      return;
    }
    const tooLarge = selected.find((file) => file.size > MAX_PHOTO_SIZE);
    if (tooLarge) {
      setError(`A foto "${tooLarge.name}" excede o limite de 5 MB.`);
      return;
    }
    setError('');
    setFiles((current) => [...current, ...selected]);
  }

  function removeExistingPhoto(index) {
    const photo = existingPhotos[index];
    setExistingPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
    if (photo?.path) {
      setRemovedPaths((current) => current.includes(photo.path) ? current : [...current, photo.path]);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setError('');
    if (!form.material.trim() || !form.acabamento.trim()) {
      setError('Informe o material e a cor ou acabamento.');
      return;
    }
    const positiveFields = [
      ['espessura', 'espessura'],
      ['comprimento', 'comprimento'],
      ['largura', 'largura'],
      ['quantidade', 'quantidade'],
    ];
    for (const [key, label] of positiveFields) {
      if (String(form[key]).trim() === '' || !Number.isFinite(Number(form[key])) || Number(form[key]) <= 0) {
        setError(`Informe um valor positivo para ${label}.`);
        return;
      }
    }
    if (!Number.isInteger(Number(form.quantidade)) || Number(form.quantidade) > 2147483647) {
      setError('A quantidade deve ser um número inteiro de peças.');
      return;
    }
    for (const key of ['espessura', 'comprimento', 'largura']) {
      const value = Number(form[key]);
      if (value > 999999999.999 || Math.abs(Math.round(value * 1000) - value * 1000) > 0.000001) {
        setError('Informe medidas com até três casas decimais.');
        return;
      }
    }
    if (!negotiable && !calculations) {
      setError('Informe um preço válido com até duas casas decimais.');
      return;
    }
    if (form.cidade.trim().length < 2 || form.cidade.trim().length > 100 || !form.bairro.trim() || form.bairro.trim().length > 100 || form.observacoes.length > 5000) {
      setError('Confira a cidade, o bairro e as observações.');
      return;
    }
    if (existingPhotos.length + files.length > MAX_PHOTOS) {
      setError('Você pode manter no máximo 3 fotos.');
      return;
    }
    const data = {
      material: form.material.trim(),
      espessura: Number(form.espessura),
      acabamento: form.acabamento.trim(),
      comprimento: Number(form.comprimento),
      largura: Number(form.largura),
      quantidade: Number(form.quantidade),
      preco: price,
      observacoes: form.observacoes.trim(),
      cidade: form.cidade.trim(),
      bairro: form.bairro.trim(),
      status: form.status,
    };
    setSubmitting(true);
    try {
      await onSave(data, files, removedPaths);
      navigate('/minhas-sobras');
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível salvar o anúncio.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (isEdit && !initial) {
    return (
      <div className="page-container">
        <h1>Editar anúncio</h1>
        <p className="loading" role="status">Aguardando os dados do anúncio...</p>
        <Link className="button outline" to="/minhas-sobras">Voltar para minhas sobras</Link>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <h1>{isEdit ? 'Editar anúncio' : 'Anunciar sobra'}</h1>
          <p className="muted">Informe os detalhes do material.</p>
        </div>
        <Link className="button outline" to="/minhas-sobras"><ArrowLeft size={18} aria-hidden="true" /> Voltar</Link>
      </div>
      <div className="panel">
        <Alert>{error}</Alert>
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor="listing-material">Tipo de material</label>
              <select className="field-input" id="listing-material" name="material" required value={form.material} onChange={updateField}>
                <option value="">Selecione o material</option>
                {MATERIALS.map((material) => <option key={material} value={material}>{material}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="listing-espessura">Espessura (mm)</label>
              <input className="field-input" id="listing-espessura" name="espessura" type="number" min="0" step="any" required value={form.espessura} onChange={updateField} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="listing-acabamento">Cor ou acabamento</label>
              <select className="field-input" id="listing-acabamento" name="acabamento" required value={form.acabamento} onChange={updateField}>
                <option value="">Selecione a cor ou acabamento</option>
                {FINISHES.map((finish) => <option key={finish} value={finish}>{finish}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="listing-comprimento">Comprimento (cm)</label>
              <input className="field-input" id="listing-comprimento" name="comprimento" type="number" min="0" step="any" required value={form.comprimento} onChange={updateField} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="listing-largura">Largura (cm)</label>
              <input className="field-input" id="listing-largura" name="largura" type="number" min="0" step="any" required value={form.largura} onChange={updateField} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="listing-quantidade">Quantidade de peças</label>
              <input className="field-input" id="listing-quantidade" name="quantidade" type="number" min="1" step="1" required value={form.quantidade} onChange={updateField} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="listing-preco">Preço da sobra (R$)</label>
              <input className="field-input" id="listing-preco" name="preco" type="number" min="0" step="0.01" disabled={negotiable} value={form.preco} onChange={updateField} />
              <label><input type="checkbox" checked={negotiable} onChange={(event) => setNegotiable(event.target.checked)} /> Valor a combinar</label>
              <small className="muted">A comissão de {rate.toLocaleString('pt-BR')}% é acrescida ao preço e descontada do valor final para calcular o repasse.</small>
              {calculations && <small className="muted">Preço ao comprador: <strong>{formatPrice(Number(calculations.finalCents) / 100)}</strong> · Comissão: {formatPrice(Number(calculations.commissionCents) / 100)} · Repasse estimado: <strong>{formatPrice(Number(calculations.payoutCents) / 100)}</strong></small>}
              {negotiable && <small className="muted">O valor poderá ser definido na negociação. O frete é combinado separadamente.</small>}
            </div>
            <div className="field">
              <label className="field-label" htmlFor="listing-cidade">Cidade</label>
              <input className="field-input" id="listing-cidade" name="cidade" required value={form.cidade} onChange={updateField} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="listing-bairro">Bairro</label>
              <input className="field-input" id="listing-bairro" name="bairro" required value={form.bairro} onChange={updateField} />
            </div>
            <div className="field full-span">
              <label className="field-label" htmlFor="listing-observacoes">Observações</label>
              <textarea className="field-input" id="listing-observacoes" name="observacoes" rows="4" value={form.observacoes} onChange={updateField} />
            </div>
            <div className="field full-span">
              <label className="field-label" htmlFor="listing-photos">Fotos da sobra</label>
              <div className="upload-zone">
                <ImagePlus aria-hidden="true" />
                <p>Adicione até 3 fotos JPG, PNG ou WebP de até 5 MB cada.</p>
                <input className="field-input" id="listing-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={submitting} onChange={addPhotos} />
              </div>
              {(existingPhotos.length > 0 || previews.length > 0) && (
                <div className="preview-grid">
                  {existingPhotos.map((photo, index) => (
                    <div key={`${photo.path || 'foto'}-${index}`}>
                      {photo.url ? <img className="preview-image" src={photo.url} alt={`Foto atual ${index + 1}`} /> : <span>Foto sem prévia</span>}
                      <button className="button outline small" type="button" disabled={submitting} onClick={() => removeExistingPhoto(index)} aria-label={`Remover foto atual ${index + 1}`}><X size={16} aria-hidden="true" /> Remover</button>
                    </div>
                  ))}
                  {previews.map((preview, index) => (
                    <div key={`${preview.url}-${index}`}>
                      <img className="preview-image" src={preview.url} alt={`Prévia de ${preview.file.name}`} />
                      <button className="button outline small" type="button" disabled={submitting} onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} aria-label={`Remover foto ${preview.file.name}`}><X size={16} aria-hidden="true" /> Remover</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="form-actions">
            <Link className="button outline" to="/minhas-sobras">Cancelar</Link>
            <button className="button primary" type="submit" disabled={submitting}>{submitting ? 'Salvando...' : (isEdit ? 'Salvar alterações' : 'Publicar sobra')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AdminPage({ profiles, listings, loading, onToggleProfile, onDelete }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const profileItems = Array.isArray(profiles) ? profiles : [];
  const listingItems = Array.isArray(listings) ? listings : [];
  const availableCount = listingItems.filter((listing) => normalizeStatus(listing.status) === 'disponivel').length;

  async function toggleProfile(profile) {
    if (pending) return;
    setError('');
    setPending({ id: profile.id, type: 'profile' });
    try {
      await onToggleProfile(profile);
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível alterar o status da marcenaria.'));
    } finally {
      setPending(null);
    }
  }

  async function deleteListing(listing) {
    if (pending || !window.confirm('Deseja excluir este anúncio?')) return;
    setError('');
    setPending({ id: listing.id, type: 'listing' });
    try {
      await onDelete(listing.id);
    } catch (err) {
      setError(errorMessage(err, 'Não foi possível excluir o anúncio.'));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="page-container">
      <div className="page-heading">
        <div>
          <h1>Administração</h1>
          <p className="muted">Gerencie marcenarias e anúncios.</p>
        </div>
      </div>
      <Alert>{error}</Alert>
      {loading ? (
        <p className="loading" role="status">Carregando dados...</p>
      ) : (
        <>
          <section className="admin-stats" aria-label="Resumo">
            <div className="stat-card"><span>Marcenarias</span><strong>{profileItems.length}</strong></div>
            <div className="stat-card"><span>Anúncios</span><strong>{listingItems.length}</strong></div>
            <div className="stat-card"><span>Disponíveis</span><strong>{availableCount}</strong></div>
          </section>
          <section className="panel" aria-labelledby="admin-profiles-title">
            <h2 id="admin-profiles-title">Marcenarias</h2>
            {profileItems.length === 0 ? (
              <p className="empty-state">Nenhuma marcenaria cadastrada.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th scope="col">Nome</th><th scope="col">E-mail</th><th scope="col">Cidade</th><th scope="col">Bairro</th><th scope="col">Status</th><th scope="col">Ações</th></tr></thead>
                  <tbody>
                    {profileItems.map((profile) => (
                      <tr key={profile.id}>
                        <td>{profile.nome || 'Não informado'}</td>
                        <td>{profile.email || 'Não informado'}</td>
                        <td>{profile.cidade || 'Não informada'}</td>
                        <td>{profile.bairro || 'Não informado'}</td>
                        <td>{profile.ativo ? 'Ativa' : 'Inativa'}</td>
                        <td>
                          <button className="button outline small" type="button" disabled={Boolean(pending)} onClick={() => toggleProfile(profile)} aria-label={`${profile.ativo ? 'Desativar' : 'Ativar'} ${profile.nome || 'marcenaria'}`}>
                            {pending?.type === 'profile' && pending.id === profile.id ? 'Aguarde...' : (profile.ativo ? 'Desativar' : 'Ativar')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="panel" aria-labelledby="admin-listings-title">
            <h2 id="admin-listings-title">Todos os anúncios</h2>
            {listingItems.length === 0 ? (
              <p className="empty-state">Nenhum anúncio cadastrado.</p>
            ) : (
              <div className="list-stack">
                {listingItems.map((listing) => (
                  <article className="manage-card" key={listing.id}>
                    <ListingImage listing={listing} />
                    <div className="manage-content">
                      <ListingDetails listing={listing} />
                      <div className="manage-actions">
                        <button className="button danger small" type="button" disabled={Boolean(pending)} onClick={() => deleteListing(listing)} aria-label={`Excluir anúncio de ${listing.material || 'material'}`}>
                          <Trash2 size={16} aria-hidden="true" /> {pending?.type === 'listing' && pending.id === listing.id ? 'Excluindo...' : 'Excluir'}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
