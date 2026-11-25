import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Layers3, LogOut, Menu, Plus, Search, X } from 'lucide-react'
import { HomePage, SearchPage, DetailsPage } from './CatalogViews.jsx'
import { LoginPage, RegisterPage, MyListingsPage, ListingFormPage, AdminPage } from './AccountViews.jsx'
import { ensureSupabase, isConfigured, messageFromError, supabase } from './supabase.js'
import * as api from './api.js'

const configurationMessage = 'O aplicativo ainda não está conectado ao Supabase.'

function useAuth() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [initializing, setInitializing] = useState(isConfigured)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session)
        setInitializing(false)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession)
        setInitializing(false)
      }
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  const userId = session?.user?.id
  useEffect(() => {
    let active = true
    setProfile(null)
    setProfileError('')
    if (!userId) {
      setProfileLoading(false)
      return () => { active = false }
    }
    setProfileLoading(true)
    api.getProfile(userId).then((result) => {
      if (active) setProfile(result)
    }).catch((error) => {
      if (active) setProfileError(error.message)
    }).finally(() => {
      if (active) setProfileLoading(false)
    })
    return () => { active = false }
  }, [userId])

  return { session, profile, initializing, profileLoading, profileError }
}

function useData(loader, dependencies) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const refresh = useCallback(async () => {
    const current = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const result = await loader()
      if (requestId.current === current) setData(result)
      return result
    } catch (caught) {
      if (requestId.current === current) setError(caught.message)
      return null
    } finally {
      if (requestId.current === current) setLoading(false)
    }
  }, dependencies)
  useEffect(() => {
    setData(null)
    refresh()
    return () => { requestId.current += 1 }
  }, [refresh])
  return { data, loading, error, refresh }
}

function Logo() {
  return <Link className="brand" to="/" aria-label="Tem Estoque, página inicial"><span className="brand-mark"><Layers3 size={21} strokeWidth={2.1} /></span><span>tem<span className="brand-accent">estoque</span><span className="brand-dot">.</span></span></Link>
}

function Header({ auth, onLogout }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  useEffect(() => { setOpen(false) }, [location.pathname])
  return <header className="site-header"><div className="header-inner"><Logo /><nav className={`header-nav ${open ? 'is-open' : ''}`} aria-label="Navegação principal">
    <Link className="nav-link" to="/buscar">Buscar sobras</Link>
    {auth.session ? <>
      {auth.profile?.role === 'admin' ? <Link className="nav-link" to="/administracao">Administração</Link> : <Link className="nav-link" to="/minhas-sobras">Minhas sobras</Link>}
      <button className="nav-link nav-logout" type="button" onClick={onLogout}><LogOut size={16} /> Sair</button>
      {auth.profile?.role !== 'admin' && <Link className="button primary small" to="/sobras/nova"><Plus size={17} /> Publicar sobra</Link>}
    </> : <><Link className="nav-link" to="/entrar">Entrar</Link><Link className="button primary small" to="/cadastro">Cadastrar marcenaria <ArrowRight size={16} /></Link></>}
  </nav><button className="icon-button mobile-menu-toggle" type="button" aria-label={open ? 'Fechar menu' : 'Abrir menu'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button></div></header>
}

function Footer() {
  return <footer className="footer"><div className="page-container footer-inner"><div><Logo /><p>Sobra para um. Possibilidade para outro.</p></div><p>A negociação de valor e retirada é feita diretamente entre as marcenarias.</p><Link to="/buscar">Encontrar sobras <ArrowRight size={16} /></Link></div></footer>
}

function Protected({ auth, admin = false, children }) {
  const location = useLocation()
  if (!isConfigured) return <div className="page-container section"><div className="alert info">{configurationMessage}</div></div>
  if (auth.initializing || auth.profileLoading || (auth.session && !auth.profile && !auth.profileError)) return <div className="page-container loading">Carregando sua conta...</div>
  if (!auth.session) return <Navigate to="/entrar" state={{ from: location.pathname }} replace />
  if (auth.profileError) return <div className="page-container section"><div className="alert error">{auth.profileError}</div></div>
  if (!auth.profile?.ativo) return <div className="page-container section"><div className="alert error">Esta marcenaria está desativada. Entre em contato com a administração.</div></div>
  if (admin && auth.profile.role !== 'admin') return <div className="page-container section"><div className="alert error">Você não tem permissão para acessar esta página.</div></div>
  if (!admin && auth.profile.role === 'admin') return <Navigate to="/administracao" replace />
  return children
}

function HomeRoute({ auth }) {
  const { data, loading, error } = useData(() => api.getVisibleListings({ recentOnly: true }), [auth.session?.user?.id])
  return <HomePage listings={data || []} loading={loading} configError={error} signedIn={Boolean(auth.session)} />
}

function SearchRoute({ auth }) {
  const userId = auth.session?.user?.id
  const { data, loading, error } = useData(() => api.getVisibleListings(), [userId])
  return <SearchPage listings={data || []} loading={loading} configError={error} currentUserId={userId} />
}

function DetailsRoute({ auth }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const userId = auth.session?.user?.id
  const { data, loading, error } = useData(() => api.getListing(id), [id, userId])
  const [contactError, setContactError] = useState('')
  async function contact(listing) {
    if (!auth.session) {
      navigate('/entrar', { state: { from: `/sobras/${listing.id}` } })
      return
    }
    try {
      setContactError('')
      const number = await api.getContact(listing.id)
      const digits = number.replace(/\D/g, '')
      const message = `Olá! Vi no Tem Estoque que vocês têm uma sobra de ${listing.material}, ${listing.espessura} mm, medindo ${listing.comprimento} x ${listing.largura} cm. Ainda está disponível? Gostaria de combinar valor e retirada.`
      window.location.href = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
    } catch (caught) {
      setContactError(caught.message)
    }
  }
  return <><DetailsPage listing={data} loading={loading} onContact={contact} currentUserId={userId} configError={error} />{contactError && <div className="page-container"><div className="alert error" role="alert">{contactError}</div></div>}</>
}

function MyListingsRoute({ auth }) {
  const { data, loading, error, refresh } = useData(() => api.getOwnListings(auth.session.user.id), [auth.session.user.id])
  async function changeStatus(id, status) { await api.changeStatus(id, status); await refresh() }
  async function remove(id) { await api.deleteListing(id); await refresh() }
  return <>{error && <div className="page-container section"><div className="alert error">{error}</div></div>}<MyListingsPage listings={data || []} loading={loading} onStatusChange={changeStatus} onDelete={remove} /></>
}

function FormRoute({ auth, edit = false }) {
  const { id } = useParams()
  const { data, loading, error } = useData(() => edit ? api.getOwnListing(id, auth.session.user.id) : Promise.resolve(null), [id, edit, auth.session.user.id])
  if (loading) return <div className="page-container loading">Carregando...</div>
  if (error) return <div className="page-container section"><div className="alert error">{error}</div></div>
  if (edit && !data) return <div className="page-container section"><div className="alert error">Sobra não encontrada.</div></div>
  return <ListingFormPage initial={data} profile={auth.profile} isEdit={edit} onSave={(form, files, removedPaths) => api.saveListing(form, files, removedPaths, auth.session.user.id, data)} />
}

function AdminRoute() {
  const { data, loading, error, refresh } = useData(async () => {
    const [profiles, listings] = await Promise.all([api.getAdminProfiles(), api.getAdminListings()])
    return { profiles, listings }
  }, [])
  async function toggle(profile) { await api.toggleProfile(profile); await refresh() }
  async function remove(id) { await api.deleteListing(id); await refresh() }
  return <>{error && <div className="page-container section"><div className="alert error">{error}</div></div>}<AdminPage profiles={data?.profiles || []} listings={data?.listings || []} loading={loading} onToggleProfile={toggle} onDelete={remove} /></>
}

function App() {
  const auth = useAuth()
  const navigate = useNavigate()
  async function login({ email, password }) {
    const { error } = await ensureSupabase().auth.signInWithPassword({ email, password })
    if (error) throw new Error(messageFromError(error))
  }
  async function signup({ nome, email, password, whatsapp, cidade, bairro }) {
    const { data, error } = await ensureSupabase().auth.signUp({ email, password, options: { data: { nome, whatsapp, cidade, bairro }, emailRedirectTo: `${window.location.origin}/entrar` } })
    if (error) throw new Error(messageFromError(error))
    if (data.user?.identities?.length === 0) throw new Error('Já existe uma conta com este e-mail.')
    return { confirmationRequired: !data.session }
  }
  async function logout() {
    if (supabase) await supabase.auth.signOut()
    navigate('/')
  }
  return <div className="app-shell"><Header auth={auth} onLogout={logout} /><div id="conteudo"><Routes>
    <Route path="/" element={<HomeRoute auth={auth} />} />
    <Route path="/buscar" element={<SearchRoute auth={auth} />} />
    <Route path="/sobras/:id" element={<DetailsRoute auth={auth} />} />
    <Route path="/entrar" element={<LoginPage onLogin={login} />} />
    <Route path="/cadastro" element={<RegisterPage onSignup={signup} />} />
    <Route path="/minhas-sobras" element={<Protected auth={auth}><MyListingsRoute auth={auth} /></Protected>} />
    <Route path="/sobras/nova" element={<Protected auth={auth}><FormRoute auth={auth} /></Protected>} />
    <Route path="/sobras/:id/editar" element={<Protected auth={auth}><FormRoute auth={auth} edit /></Protected>} />
    <Route path="/administracao" element={<Protected auth={auth} admin><AdminRoute /></Protected>} />
    <Route path="*" element={<div className="page-container section empty-state"><Search size={30} /><h1>Página não encontrada</h1><Link className="button primary" to="/">Voltar ao início</Link></div>} />
  </Routes></div><Footer /></div>
}

export default App
