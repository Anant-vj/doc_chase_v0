import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, FileText, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { Logo, Field, Button, ErrorNotice } from "../ui";

export function AuthPage({ register = false }) {
  const [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    navigate = useNavigate(),
    cache = useQueryClient();
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget)),
        data = await api(`/auth/${register ? "register" : "login"}`, {
          method: "POST",
          body,
        });
      cache.clear();
      cache.setQueryData(["session"], data);
      navigate("/workspace");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function demo() {
    setBusy(true);
    setError(null);
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: { email: "owner@docchase.demo", password: "DocChaseDemo!2026" },
      });
      cache.clear();
      cache.setQueryData(["session"], data);
      navigate("/workspace");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Logo />
        <div className="auth-story-content">
          <p className="eyebrow">FOR THE PRACTICE BEHIND THE PAPERWORK</p>
          <h1>
            Close the books.
            <br />
            <em>Leave the chasing.</em>
          </h1>
          <p>
            A clearer path from “please send your invoices” to everything
            reviewed and ready.
          </p>
          <div className="paper-stack">
            <div className="paper-back" />
            <div className="paper-front">
              <div className="paper-heading">
                <FileText size={23} />
                <span>September documents</span>
                <span className="paper-seal">
                  <Check size={16} />
                </span>
              </div>
              {["Purchase invoices", "Sales invoices", "Ready for review"].map(
                (label, i) => (
                  <div className="paper-row" key={label}>
                    <span className="paper-check">
                      <Check size={13} />
                    </span>
                    <span>{label}</span>
                    <span>{i === 2 ? "All in order" : "Received"}</span>
                  </div>
                ),
              )}
              <div className="paper-footer">
                A little less back and forth. <ArrowRight size={14} />
              </div>
            </div>
          </div>
        </div>
        <p className="auth-story-footer">
          Made for small firms. And the people they work with.
        </p>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form">
          <span className="auth-kicker">YOUR DOCUMENT WORKSPACE</span>
          <h2>
            {register ? "Make room for a calmer practice." : "Welcome back."}
          </h2>
          <p>
            {register
              ? "Set up your firm and start with your first client."
              : "Sign in to pick up where you left off."}
          </p>
          {error && <ErrorNotice error={error} />}
          <form onSubmit={submit}>
            {register && (
              <>
                <Field
                  label="Firm name"
                  name="firmName"
                  required
                  minLength={2}
                  autoComplete="organization"
                  placeholder="Sharma & Associates"
                />
                <Field
                  label="Your name"
                  name="name"
                  required
                  minLength={2}
                  autoComplete="name"
                  placeholder="Ananya Sharma"
                />
              </>
            )}
            <Field
              label="Email address"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@yourfirm.com"
            />
            <Field
              label="Password"
              name="password"
              type="password"
              required
              minLength={register ? 10 : undefined}
              maxLength={72}
              autoComplete={register ? "new-password" : "current-password"}
              hint={register ? "Use at least 10 characters." : undefined}
            />
            <Button busy={busy} className="full-width">
              {register ? "Create your workspace" : "Sign in"}
              <ArrowRight size={16} />
            </Button>
          </form>
          <div className="auth-divider">
            <span>or take a look around</span>
          </div>
          <Button
            variant="secondary"
            className="full-width"
            busy={busy}
            onClick={demo}
          >
            Explore the sample workspace
          </Button>
          <p className="demo-disclosure">
            The sample workspace uses fictional clients and synthetic invoices.
          </p>
          <p className="auth-switch">
            {register ? "Already have a workspace?" : "New to DocChase?"}{" "}
            <Link to={register ? "/login" : "/register"}>
              {register ? "Sign in" : "Create your firm"}
            </Link>
          </p>
          <div className="auth-privacy">
            <ShieldCheck size={15} />
            Private files. Access only for your firm.
          </div>
        </div>
      </section>
    </main>
  );
}
