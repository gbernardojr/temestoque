import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const isConfigured = Boolean(url && key)
export const supabase = isConfigured ? createClient(url, key) : null

const errors = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar.',
  user_already_exists: 'Já existe uma conta com este e-mail.',
  email_exists: 'Já existe uma conta com este e-mail.',
  weak_password: 'Escolha uma senha mais forte.',
  over_email_send_rate_limit: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  over_request_rate_limit: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  signup_disabled: 'O cadastro está indisponível no momento.',
}

export function messageFromError(error) {
  if (!error) return 'Não foi possível concluir a operação. Tente novamente.'
  if (errors[error.code]) return errors[error.code]
  if (error.code === 'P0001' && [
    'Esta sobra não está mais disponível.',
    'Você não pode reservar sua própria sobra.',
    'Esta sobra está reservada em um carrinho e não pode ser alterada.',
    'As fotos não podem ser alteradas enquanto a sobra estiver reservada.',
    'Reserva não encontrada.',
    'O preço desta reserva já foi definido.',
  ].includes(error.message)) return error.message
  if (error.message?.includes('Invalid login credentials')) return errors.invalid_credentials
  if (error.message?.includes('Email not confirmed')) return errors.email_not_confirmed
  if (error.message?.includes('User already registered')) return errors.user_already_exists
  if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) return 'Não foi possível conectar ao servidor. Confira sua conexão e tente novamente.'
  return 'Não foi possível concluir a operação. Tente novamente.'
}

export function ensureSupabase() {
  if (!supabase) throw new Error('O aplicativo ainda não está conectado ao Supabase.')
  return supabase
}
