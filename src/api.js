import { ensureSupabase, messageFromError } from './supabase.js'

const bucket = 'anuncios-fotos'
const pageSize = 500

function fail(error) {
  throw new Error(messageFromError(error))
}

async function allPages(makeQuery) {
  const rows = []
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await makeQuery().range(start, start + pageSize - 1)
    if (error) fail(error)
    rows.push(...data)
    if (data.length < pageSize) return rows
  }
}

function normalizeListing(row, photos = []) {
  return {
    ...row,
    user_id: row.marcenaria_id,
    marcenaria_nome: row.marcenaria_nome || row.perfis?.nome,
    espessura: Number(row.espessura),
    comprimento: Number(row.comprimento),
    largura: Number(row.largura),
    quantidade: Number(row.quantidade),
    preco: row.preco == null ? null : Number(row.preco),
    fotos: photos,
  }
}

async function hydrate(rows, allImages = false) {
  if (!rows.length) return []
  const client = ensureSupabase()
  const photoRows = []
  for (let start = 0; start < rows.length; start += 100) {
    const ids = rows.slice(start, start + 100).map((row) => row.id)
    const { data, error } = await client.from('anuncio_fotos').select('anuncio_id,posicao,caminho').in('anuncio_id', ids).order('posicao')
    if (error) fail(error)
    photoRows.push(...data)
  }
  const selected = allImages ? photoRows : photoRows.filter((photo, index, array) => array.findIndex((item) => item.anuncio_id === photo.anuncio_id) === index)
  const urls = new Map()
  for (let start = 0; start < selected.length; start += 100) {
    const paths = selected.slice(start, start + 100).map((photo) => photo.caminho)
    const { data, error } = await client.storage.from(bucket).createSignedUrls(paths, 600)
    if (error) fail(error)
    data.forEach((item) => {
      if (item.signedUrl && item.path) urls.set(item.path, item.signedUrl)
      else if (item.error) console.warn('Não foi possível carregar uma foto da sobra.')
    })
  }
  const byListing = new Map()
  for (const photo of photoRows) {
    if (!byListing.has(photo.anuncio_id)) byListing.set(photo.anuncio_id, [])
    byListing.get(photo.anuncio_id).push({ path: photo.caminho, url: urls.get(photo.caminho) || null })
  }
  return rows.map((row) => normalizeListing(row, byListing.get(row.id) || []))
}

export async function getProfile(id) {
  const { data, error } = await ensureSupabase().from('perfis').select('*').eq('id', id).maybeSingle()
  if (error) fail(error)
  if (!data) throw new Error('Não foi possível encontrar o perfil desta conta.')
  return data
}

export async function getVisibleListings(options = {}) {
  const client = ensureSupabase()
  if (options.recentOnly) {
    const { data, error } = await client.from('anuncios_publicos').select('*').eq('status', 'Disponível').order('created_at', { ascending: false }).limit(6)
    if (error) fail(error)
    return hydrate(data)
  }
  const rows = await allPages(() => client.from('anuncios_publicos').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }))
  return hydrate(rows)
}

export async function getListing(id) {
  const { data, error } = await ensureSupabase().from('anuncios_publicos').select('*').eq('id', id).maybeSingle()
  if (error) fail(error)
  return data ? (await hydrate([data], true))[0] : null
}

export async function getOwnListings(userId) {
  const client = ensureSupabase()
  const [rows, reservations] = await Promise.all([
    allPages(() => client.from('anuncios').select('*').eq('marcenaria_id', userId).order('created_at', { ascending: false }).order('id', { ascending: false })),
    getReservations(),
  ])
  const reserved = new Set(reservations.filter((item) => item.vendedor_id === userId).map((item) => item.anuncio_id))
  return hydrate(rows.map((row) => ({ ...row, reservada_em_carrinho: reserved.has(row.id) })))
}

export async function getOwnListing(id, userId) {
  const { data, error } = await ensureSupabase().from('anuncios').select('*').eq('id', id).eq('marcenaria_id', userId).maybeSingle()
  if (error) fail(error)
  return data ? (await hydrate([data], true))[0] : null
}

export async function getAdminProfiles() {
  const client = ensureSupabase()
  const rows = await allPages(() => client.rpc('admin_usuarios').order('created_at', { ascending: false }).order('id', { ascending: false }))
  return rows.filter((profile) => profile.role === 'marcenaria')
}

export async function getAdminListings() {
  const client = ensureSupabase()
  const rows = await allPages(() => client.from('anuncios').select('*,perfis(nome)').order('created_at', { ascending: false }).order('id', { ascending: false }))
  return hydrate(rows)
}

export async function getCommissionRate() {
  const { data, error } = await ensureSupabase().from('configuracoes_app').select('comissao_percentual').eq('id', true).single()
  if (error) fail(error)
  return Number(data.comissao_percentual)
}

export async function addToCart(id) {
  const { error } = await ensureSupabase().rpc('adicionar_ao_carrinho', { p_anuncio_id: id })
  if (error) fail(error)
}

export async function getReservations() {
  const data = await allPages(() => ensureSupabase().rpc('minhas_reservas'))
  return data.map((item) => ({
    ...item,
    preco_base: item.preco_base == null ? null : Number(item.preco_base),
    preco_final: item.preco_final == null ? null : Number(item.preco_final),
    percentual_comissao: Number(item.percentual_comissao),
    valor_comissao: item.valor_comissao == null ? null : Number(item.valor_comissao),
    valor_repasse: item.valor_repasse == null ? null : Number(item.valor_repasse),
  }))
}

export async function removeFromCart(id) {
  const { error } = await ensureSupabase().rpc('remover_do_carrinho', { p_reserva_id: id })
  if (error) fail(error)
}

export async function setReservationPrice(id, price) {
  const { error } = await ensureSupabase().rpc('definir_preco_reserva', { p_reserva_id: id, p_preco: price })
  if (error) fail(error)
}

export async function getMessages(id) {
  return allPages(() => ensureSupabase().from('mensagens_negociacao')
    .select('id,reserva_id,autor_id,conteudo,created_at').eq('reserva_id', id)
    .order('created_at').order('id'))
}

export async function sendMessage(id, content) {
  const { error } = await ensureSupabase().from('mensagens_negociacao').insert({ reserva_id: id, conteudo: content })
  if (error) fail(error)
}

export async function changeStatus(id, status) {
  const { data, error } = await ensureSupabase().from('anuncios').update({ status }).eq('id', id).select('id').maybeSingle()
  if (error) fail(error)
  if (!data) throw new Error('Não foi possível alterar esta sobra.')
}

export async function toggleProfile(profile) {
  const { error } = await ensureSupabase().rpc('admin_definir_ativo', { p_usuario_id: profile.id, p_ativo: !profile.ativo })
  if (error) fail(error)
}

export async function deleteListing(id) {
  const client = ensureSupabase()
  const { data: photos, error: photoError } = await client.from('anuncio_fotos').select('caminho').eq('anuncio_id', id)
  if (photoError) fail(photoError)
  const { data, error } = await client.from('anuncios').delete().eq('id', id).select('id').maybeSingle()
  if (error) fail(error)
  if (!data) throw new Error('Não foi possível excluir esta sobra.')
  if (photos.length) {
    const { error: cleanupError } = await client.storage.from(bucket).remove(photos.map((photo) => photo.caminho))
    if (cleanupError) console.warn('Não foi possível remover todos os arquivos da sobra excluída.')
  }
}

export async function saveListing(form, files, removedPaths, userId, original) {
  const client = ensureSupabase()
  let id = original?.id
  if (id) {
    const { data, error } = await client.from('anuncios').update(form).eq('id', id).eq('marcenaria_id', userId).select('id').maybeSingle()
    if (error) fail(error)
    if (!data) throw new Error('Não foi possível alterar esta sobra.')
  } else {
    const { data, error } = await client.from('anuncios').insert(form).select('id').single()
    if (error) fail(error)
    id = data.id
  }

  const previousPaths = original?.fotos?.map((photo) => photo.path) || []
  const remaining = previousPaths.filter((path) => !removedPaths.includes(path))
  const uploaded = []
  let replaceAttempted = false
  try {
    if (files.length) {
      const directory = `${userId}/${id}`
      const { data: existing, error: listError } = await client.storage.from(bucket).list(directory, { limit: 100 })
      if (listError) throw listError
      const occupied = new Set(existing.map((item) => item.name))
      const available = ['1', '2', '3', '4', '5', '6'].filter((position) => !occupied.has(position))
      if (available.length < files.length) throw new Error('Não há espaço temporário para substituir as fotos. Tente novamente mais tarde.')
      for (const [index, file] of files.entries()) {
        const path = `${directory}/${available[index]}`
        const { error } = await client.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false })
        if (error) throw error
        uploaded.push(path)
      }
    }
    if (files.length || removedPaths.length) {
      replaceAttempted = true
      const { error } = await client.rpc('substituir_fotos', { p_anuncio_id: id, p_anteriores: previousPaths, p_caminhos: [...remaining, ...uploaded] })
      if (error) throw error
    }
  } catch (error) {
    if (replaceAttempted) {
      throw new Error('Não foi possível confirmar a atualização das fotos. Confira a sobra em Minhas sobras antes de tentar novamente.')
    }
    if (uploaded.length) await client.storage.from(bucket).remove(uploaded)
    if (!original) await client.from('anuncios').delete().eq('id', id)
    const message = error.message?.includes('espaço temporário') ? error.message : messageFromError(error)
    throw new Error(original ? `Os dados da sobra foram salvos, mas não foi possível atualizar as fotos. ${message}` : `Não foi possível publicar as fotos. ${message}`)
  }
  if (removedPaths.length) {
    const { error } = await client.storage.from(bucket).remove(removedPaths)
    if (error) console.warn('Não foi possível remover todas as fotos antigas.')
  }
}
