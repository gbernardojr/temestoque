import { useEffect, useId, useRef, useState } from 'react';
import { MessageCircle, PackageOpen, Send, Trash2 } from 'lucide-react';

const POLL_INTERVAL = 10000;
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const MAX_PRICE_CENTS = 999999999999n;

function priceCalculations(value, rate) {
  if (value === null || String(value).trim() === '') return null;
  const price = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100 || !Number.isFinite(price) || price < 0 ||
      Math.abs(Math.round(price * 100) - price * 100) > 0.000001) return null;
  const finalCents = (BigInt(Math.round(price * 100)) * BigInt(10000 + Math.round(rate * 100)) + 5000n) / 10000n;
  if (finalCents > MAX_PRICE_CENTS) return null;
  const commissionCents = (finalCents * BigInt(Math.round(rate * 100)) + 5000n) / 10000n;
  return { finalCents, commissionCents, payoutCents: finalCents - commissionCents };
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function sameId(first, second) {
  return hasValue(first) && hasValue(second) && String(first) === String(second);
}

function displayValue(value, fallback = 'Não informado') {
  if (!hasValue(value)) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? number.format(value) : fallback;
  return String(value);
}

function money(value, fallback = 'Não informado') {
  return typeof value === 'number' && Number.isFinite(value) ? currency.format(value) : fallback;
}

function dateTime(value) {
  if (!value) return 'Data não informada';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data não informada' : date.toLocaleString('pt-BR');
}

function errorMessage(error, fallback) {
  if (typeof error === 'string' && error.trim()) return error;
  return typeof error?.message === 'string' && error.message.trim() ? error.message : fallback;
}

function Conversation({ reservation, userId, isSeller, onLoadMessages, onSendMessage, id }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sendError, setSendError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const mounted = useRef(false);
  const sendingRef = useRef(false);
  const requestVersion = useRef(0);
  const loadCallback = useRef(onLoadMessages);
  const sendCallback = useRef(onSendMessage);
  loadCallback.current = onLoadMessages;
  sendCallback.current = onSendMessage;
  const reservationId = reservation.id;

  async function loadMessages() {
    const version = ++requestVersion.current;
    try {
      const result = await loadCallback.current(reservationId);
      if (!Array.isArray(result)) throw new Error('Não foi possível receber as mensagens desta reserva.');
      if (mounted.current && requestVersion.current === version) {
        setMessages(result.filter((message) => message && sameId(message.reserva_id, reservationId)));
        setLoadError('');
      }
    } catch (caught) {
      if (mounted.current && requestVersion.current === version) {
        setLoadError(errorMessage(caught, 'Não foi possível carregar as mensagens.'));
      }
    } finally {
      if (mounted.current && requestVersion.current === version) setLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    let stopped = false;
    let timer;

    async function poll() {
      await loadMessages();
      if (!stopped) timer = window.setTimeout(poll, POLL_INTERVAL);
    }

    poll();
    return () => {
      stopped = true;
      mounted.current = false;
      requestVersion.current += 1;
      window.clearTimeout(timer);
    };
  }, [reservationId]);

  async function sendMessage(event) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError('');
    try {
      await sendCallback.current(reservationId, content);
      if (mounted.current) {
        setDraft('');
        await loadMessages();
      }
    } catch (caught) {
      if (mounted.current) {
        setSendError(`${errorMessage(caught, 'Não foi possível enviar a mensagem.')} Confira a conversa antes de tentar novamente.`);
      }
    } finally {
      sendingRef.current = false;
      if (mounted.current) setSending(false);
    }
  }

  const otherName = isSeller ? reservation.comprador_nome : reservation.vendedor_nome;
  const otherRole = isSeller ? 'Comprador' : 'Ofertante';

  return (
    <section className="reservation-chat" id={id} aria-label={`Conversa da reserva de ${displayValue(reservation.material, 'material')}, código ${reservation.id}`}>
      <h3><MessageCircle size={18} aria-hidden="true" /> Conversa com {displayValue(otherName, otherRole)}</h3>
      <p className="muted">Negocie preço, frete e retirada por aqui. As mensagens são atualizadas automaticamente.</p>
      {loading && <p role="status">Carregando mensagens...</p>}
      {loadError && (
        <div className="alert error" role="alert">
          <p>Não foi possível atualizar a conversa. {loadError}</p>
          <button className="button outline small" type="button" onClick={loadMessages}>Tentar novamente</button>
        </div>
      )}
      {!loading && !loadError && messages.length === 0 && <p className="muted">Nenhuma mensagem ainda. Inicie a conversa abaixo.</p>}
      {messages.length > 0 && (
        <ol className="chat-messages" role="log" aria-label="Mensagens da reserva" aria-live="polite" aria-relevant="additions text">
          {messages.map((message) => {
            const own = sameId(message.autor_id, userId);
            const other = sameId(message.autor_id, isSeller ? reservation.comprador_id : reservation.vendedor_id);
            const author = own ? 'Você' : (other ? displayValue(otherName, otherRole) : 'Participante');
            return (
              <li className={`chat-message${own ? ' own' : ''}`} key={message.id}>
                <div className="chat-message-meta"><strong>{author}</strong><time>{dateTime(message.created_at)}</time></div>
                <p>{message.conteudo}</p>
              </li>
            );
          })}
        </ol>
      )}
      {sendError && <div className="alert error" role="alert">{sendError}</div>}
      <form className="chat-form" onSubmit={sendMessage}>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-message`}>Sua mensagem</label>
          <textarea className="field-input" id={`${id}-message`} rows="3" maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} disabled={sending} required />
        </div>
        <button className="button primary small" type="submit" disabled={sending || !draft.trim()}>
          <Send size={16} aria-hidden="true" /> {sending ? 'Enviando...' : 'Enviar mensagem'}
        </button>
      </form>
    </section>
  );
}

function PriceNegotiation({ reservation, isSeller, onSetPrice, onRefresh }) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const pendingRef = useRef(false);
  const mounted = useRef(false);
  const missingPrice = typeof reservation.preco_final !== 'number' || !Number.isFinite(reservation.preco_final);
  const rate = typeof reservation.percentual_comissao === 'number' && Number.isFinite(reservation.percentual_comissao)
    ? reservation.percentual_comissao
    : 5;
  const basePrice = Number(draft);
  const calculations = priceCalculations(draft, rate);

  async function submitPrice(event) {
    event.preventDefault();
    if (!isSeller || !calculations || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError('');
    try {
      await onSetPrice(reservation.id, basePrice);
      if (mounted.current) await onRefresh();
    } catch (caught) {
      if (mounted.current) setError(errorMessage(caught, 'Não foi possível definir o preço da reserva.'));
    } finally {
      pendingRef.current = false;
      if (mounted.current) setPending(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  return (
    <div className="reservation-estimates">
      <h3>{isSeller ? 'Definir preço negociado' : 'Preço da negociação'}</h3>
      {missingPrice && !isSeller && <p className="reservation-note">O ofertante ainda não definiu o preço. Combine o valor e o frete pelo chat.</p>}
      {isSeller && missingPrice && (
        <form className="chat-form" onSubmit={submitPrice}>
          <div className="field">
            <label className="field-label" htmlFor={`${reservation.id}-base-price`}>Preço da sobra (R$)</label>
            <input className="field-input" id={`${reservation.id}-base-price`} type="number" min="0" step="0.01" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={pending} required />
            <small className="muted">A comissão de {rate.toLocaleString('pt-BR')}% será acrescida ao valor pago pelo comprador.</small>
            {calculations && <small className="muted">Valor ao comprador: <strong>{money(Number(calculations.finalCents) / 100)}</strong> · Comissão: {money(Number(calculations.commissionCents) / 100)} · Repasse estimado: <strong>{money(Number(calculations.payoutCents) / 100)}</strong></small>}
          </div>
          <button className="button primary small" type="submit" disabled={pending || !calculations}>{pending ? 'Salvando...' : 'Confirmar preço negociado'}</button>
        </form>
      )}
      {isSeller && !missingPrice && <p className="muted">O preço desta reserva já foi definido. Combine o frete e a retirada pelo chat.</p>}
      {error && <div className="alert error" role="alert">{error}</div>}
      {!missingPrice && (
        <dl className="reservation-details">
          <div><dt>Preço da sobra</dt><dd>{money(reservation.preco_base)}</dd></div>
          <div><dt>Percentual de comissão</dt><dd>{number.format(rate)}%</dd></div>
          <div><dt>Valor ao comprador</dt><dd>{money(reservation.preco_final)}</dd></div>
          <div><dt>Comissão estimada</dt><dd>{money(reservation.valor_comissao)}</dd></div>
          <div><dt>Repasse estimado</dt><dd>{money(reservation.valor_repasse)}</dd></div>
        </dl>
      )}
      <p className="muted">O frete é combinado separadamente. Os valores são estimativas; nenhum pagamento ou repasse real foi realizado.</p>
    </div>
  );
}

function ReservationCard({ reservation, userId, isSeller, open, onToggle, onRemove, removing, removalPending, removalError, onLoadMessages, onSendMessage, onSetPrice, onRefresh }) {
  const chatId = useId();
  const material = displayValue(reservation.material, 'Material não informado');
  const price = money(reservation.preco_final, 'Valor a negociar');
  const otherName = isSeller ? reservation.comprador_nome : reservation.vendedor_nome;

  return (
    <article className="panel reservation-card">
      <div className="reservation-card-heading">
        <div>
          <span className="badge reserved">Reserva ativa</span>
          <h2>{material}</h2>
          <p className="muted">{isSeller ? 'Comprador' : 'Ofertante'}: {displayValue(otherName)}</p>
        </div>
        <div className="reservation-price"><span>Valor da reserva</span><strong>{price}</strong></div>
      </div>
      <dl className="reservation-details">
        <div><dt>Cor / acabamento</dt><dd>{displayValue(reservation.acabamento)}</dd></div>
        <div><dt>Espessura</dt><dd>{hasValue(reservation.espessura) ? `${displayValue(reservation.espessura)} mm` : 'Não informada'}</dd></div>
        <div><dt>Medidas</dt><dd>{hasValue(reservation.comprimento) && hasValue(reservation.largura) ? `${displayValue(reservation.comprimento)} × ${displayValue(reservation.largura)} cm` : 'Não informadas'}</dd></div>
        <div><dt>Quantidade</dt><dd>{displayValue(reservation.quantidade)}</dd></div>
        <div><dt>Reservado em</dt><dd>{dateTime(reservation.created_at)}</dd></div>
      </dl>
      <PriceNegotiation reservation={reservation} isSeller={isSeller} onSetPrice={onSetPrice} onRefresh={onRefresh} />
      {removalError && <div className="alert error" role="alert">{removalError}</div>}
      <div className="reservation-actions">
        <button className="button outline small" type="button" aria-expanded={open} aria-controls={open ? chatId : undefined} onClick={onToggle}>
          <MessageCircle size={16} aria-hidden="true" /> {open ? 'Fechar conversa' : 'Abrir conversa'}
          <span className="sr-only"> da reserva de {material}, código {reservation.id}</span>
        </button>
        {!isSeller && (
          <button className="button danger small" type="button" disabled={removalPending} onClick={onRemove}>
            <Trash2 size={16} aria-hidden="true" /> {removing ? 'Removendo...' : 'Remover do carrinho'}
            <span className="sr-only">: {material}, reserva {reservation.id}</span>
          </button>
        )}
      </div>
      {open && <Conversation key={`${userId}:${reservation.id}`} id={chatId} reservation={reservation} userId={userId} isSeller={isSeller} onLoadMessages={onLoadMessages} onSendMessage={onSendMessage} />}
    </article>
  );
}

function ReservationsPage({ reservations, userId, loading, error, onRemove, onLoadMessages, onSendMessage, isSeller, onSetPrice, onRefresh }) {
  const [openId, setOpenId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [removalError, setRemovalError] = useState(null);
  const [simulationKey, setSimulationKey] = useState(null);
  const removalPending = useRef(false);
  const items = Array.isArray(reservations)
    ? reservations.filter((reservation) => reservation && hasValue(reservation.id) && reservation.estado === 'ativa' && sameId(isSeller ? reservation.vendedor_id : reservation.comprador_id, userId))
    : [];
  const pricedItems = items.filter((item) => typeof item.preco_final === 'number' && Number.isFinite(item.preco_final));
  const missingPrice = pricedItems.length !== items.length;
  const total = pricedItems.reduce((sum, item) => sum + item.preco_final, 0);
  const currentKey = JSON.stringify([userId, items.map((item) => [item.id, item.preco_final])]);
  const canSimulate = !loading && !error && items.length > 0 && !missingPrice && removingId === null;

  async function removeReservation(reservation) {
    if (removalPending.current || !window.confirm(`Remover a reserva de ${displayValue(reservation.material, 'material')} do carrinho?`)) return;
    removalPending.current = true;
    setRemovingId(reservation.id);
    setRemovalError(null);
    setSimulationKey(null);
    try {
      await onRemove(reservation.id);
      setOpenId((current) => sameId(current, reservation.id) ? null : current);
    } catch (caught) {
      setRemovalError({ id: reservation.id, message: `${errorMessage(caught, 'Não foi possível remover a reserva.')} Confira se a reserva ainda está ativa e atualize a página antes de tentar novamente.` });
    } finally {
      removalPending.current = false;
      setRemovingId(null);
    }
  }

  return (
    <main className="page-container reservations-page">
      <header className="page-heading">
        <span className="eyebrow">{isSeller ? 'Suas ofertas' : 'Suas reservas'}</span>
        <h1>{isSeller ? 'Negociações' : 'Meu carrinho'}</h1>
        <p>{isSeller ? 'Acompanhe as reservas e converse com cada comprador.' : 'Confira suas reservas e converse com cada ofertante.'}</p>
      </header>
      {error && <div className="alert error" role="alert">{errorMessage(error, 'Não foi possível carregar as reservas.')}</div>}
      {loading ? <p className="loading" role="status">Carregando reservas...</p> : !Array.isArray(reservations) ? (
        !error && <div className="alert info" role="status">As reservas estão indisponíveis no momento.</div>
      ) : items.length === 0 ? (
        !error && <div className="empty-state"><PackageOpen aria-hidden="true" /><p>{isSeller ? 'Você ainda não tem reservas para negociar.' : 'Seu carrinho ainda não tem reservas.'}</p></div>
      ) : (
        <div className={`reservations-layout${isSeller ? ' seller' : ''}`}>
          <div className="list-stack">
            {items.map((reservation) => (
              <ReservationCard
                key={reservation.id}
                reservation={reservation}
                userId={userId}
                isSeller={isSeller}
                open={sameId(openId, reservation.id)}
                onToggle={() => setOpenId((current) => sameId(current, reservation.id) ? null : reservation.id)}
                onRemove={() => removeReservation(reservation)}
                removing={sameId(removingId, reservation.id)}
                removalPending={removingId !== null}
                removalError={sameId(removalError?.id, reservation.id) ? removalError.message : ''}
                onLoadMessages={onLoadMessages}
                onSendMessage={onSendMessage}
                onSetPrice={onSetPrice}
                onRefresh={onRefresh}
              />
            ))}
          </div>
          {!isSeller && (
            <aside className="panel cart-summary" aria-labelledby="cart-summary-title">
              <h2 id="cart-summary-title">Resumo do carrinho</h2>
              <p>{items.length} {items.length === 1 ? 'reserva ativa' : 'reservas ativas'}</p>
              <div className="cart-total"><span>{missingPrice ? 'Subtotal dos valores informados' : 'Total dos itens'}</span><strong>{pricedItems.length ? money(total) : 'Nenhum valor informado'}</strong></div>
              {missingPrice && <p className="reservation-note">Há preço a negociar. Combine o valor pelo chat antes de simular a finalização.</p>}
              <p className="muted">O frete é negociado pelo chat e não está incluído no total.</p>
              <p className="muted">A finalização é apenas uma simulação; não realiza pagamento nem altera as reservas.</p>
              <button className="button primary" type="button" disabled={!canSimulate} onClick={() => setSimulationKey(currentKey)}>Simular finalização</button>
              {canSimulate && simulationKey === currentKey && (
                <div className="alert info" role="status"><strong>Simulação concluída.</strong> Nada foi pago, depositado ou vendido. Nenhuma reserva foi removida. Frete não incluído; negocie pelo chat.</div>
              )}
            </aside>
          )}
        </div>
      )}
    </main>
  );
}

export function CartPage({ reservations, userId, loading, error, onRemove, onLoadMessages, onSendMessage }) {
  return <ReservationsPage reservations={reservations} userId={userId} loading={loading} error={error} onRemove={onRemove} onLoadMessages={onLoadMessages} onSendMessage={onSendMessage} isSeller={false} />;
}

export function NegotiationsPage({ reservations, userId, loading, error, onLoadMessages, onSendMessage, onSetPrice, onRefresh }) {
  return <ReservationsPage reservations={reservations} userId={userId} loading={loading} error={error} onLoadMessages={onLoadMessages} onSendMessage={onSendMessage} onSetPrice={onSetPrice} onRefresh={onRefresh} isSeller />;
}
