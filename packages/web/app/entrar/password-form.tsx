import styles from "./password-form.module.css";

/** Native POST keeps passwords out of navigation URLs and works without JS. */
export default function PasswordForm({ next, failed }: { next: string; failed: boolean }) {
  return <form className={styles.form} method="post" action="/auth/password">
    <input type="hidden" name="next" value={next} />
    {failed && <p className="auth-error" role="alert">Não foi possível entrar. Confira e-mail e senha e tente novamente.</p>}
    <label className={styles.label} htmlFor="auth-email">E-mail</label>
    <input className={styles.input} id="auth-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} />
    <label className={styles.label} htmlFor="auth-password">Senha</label>
    <input className={styles.input} id="auth-password" name="password" type="password" autoComplete="current-password" required maxLength={4096} />
    <button className="auth-google-button" type="submit"><b>entrar com e-mail e senha</b></button>
    <p className={styles.note}>Use uma conta já cadastrada neste ambiente. Cadastro e recuperação de senha por e-mail não estão disponíveis aqui.</p>
  </form>;
}
