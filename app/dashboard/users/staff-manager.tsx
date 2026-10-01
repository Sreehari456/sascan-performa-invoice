"use client";

import { useId, useState, useTransition } from "react";
import { ROLES, ROLE_LABELS, generatePassword, type Role, type StaffFieldErrors, type StaffRow } from "@/lib/staff";
import { addProfile, addStaff, resetPassword, setDisabled, updateStaff } from "./actions";

const inputBase =
  "block w-full appearance-none rounded-[7px] border bg-paper px-2.5 py-[9px] text-[15px] text-ink placeholder:text-muted/60 focus:outline-none focus:ring-[3px] disabled:bg-soft disabled:text-muted";
const inputOk = "border-line focus:border-brand focus:ring-brand-soft";
const inputBad = "border-req ring-[3px] ring-[#fbecea] focus:border-req focus:ring-[#fbecea]";
const ghostButton =
  "rounded-lg border border-line bg-transparent px-[13px] py-2 text-[13px] font-semibold text-ink hover:border-ink hover:bg-soft disabled:opacity-50";
const primaryButton =
  "rounded-lg border border-brand bg-brand px-[13px] py-2 text-[13px] font-semibold text-white hover:bg-brand-ink disabled:opacity-60";

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: StaffFieldErrors };

export function StaffManager({ staff, currentUserId }: { staff: StaffRow[]; currentUserId: string }) {
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  return (
    <div className="space-y-4">
      {created && (
        <Credentials
          title="Account created"
          email={created.email}
          password={created.password}
          onClose={() => setCreated(null)}
        />
      )}

      {adding ? (
        <AddStaffForm
          onCancel={() => setAdding(false)}
          onCreated={(email, password) => {
            setAdding(false);
            setCreated({ email, password });
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setCreated(null);
            setAdding(true);
          }}
          className={primaryButton}
        >
          + Add staff
        </button>
      )}

      <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line bg-white">
        {staff.map((person) => (
          <StaffItem key={person.id} person={person} isMe={person.id === currentUserId} />
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-muted">
        Disabled people can&apos;t sign in; anything they created stays, with their name on it. Sign-ins already open
        end within an hour.
      </p>
    </div>
  );
}

/** The new sign-in details, shown once so the admin can pass them on. */
function Credentials({
  title,
  email,
  password,
  onClose,
}: {
  title: string;
  email: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = `Sign in at ${window.location.origin}/login\nEmail: ${email}\nPassword: ${password}`;
  return (
    <div role="status" className="rounded-[10px] border border-[#c7dec5] bg-brand-soft p-4 text-sm text-brand-ink">
      <p className="font-semibold">{title}. Send them these sign-in details:</p>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-white px-3 py-2 font-mono text-[13px] text-ink">{text}</pre>
      <p className="mt-2 text-xs">
        The password is shown only now. Ask them to change it under <b>My account</b> after signing in.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(text).catch(() => undefined);
            setCopied(true);
          }}
          className={primaryButton}
        >
          {copied ? "Copied" : "Copy details"}
        </button>
        <button type="button" onClick={onClose} className={ghostButton}>
          Done
        </button>
      </div>
    </div>
  );
}

function AddStaffForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (email: string, password: string) => void;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("accounts");
  const [password, setPassword] = useState(() => generatePassword());
  const [errors, setErrors] = useState<StaffFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, startWork] = useTransition();

  function submit() {
    startWork(async () => {
      const result = await addStaff({ name, email, role, password });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.error);
        return;
      }
      onCreated(email.trim().toLowerCase(), password);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
      className="grid gap-3 rounded-[10px] border border-line bg-soft p-4 sm:grid-cols-2"
    >
      <h2 className="text-[15px] font-bold sm:col-span-2">Add staff</h2>
      <Labelled label="Name" htmlFor={`${id}-name`} error={errors.name}>
        <input
          id={`${id}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${inputBase} ${errors.name ? inputBad : inputOk}`}
        />
      </Labelled>
      <Labelled label="Email" htmlFor={`${id}-email`} error={errors.email}>
        <input
          id={`${id}-email`}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`${inputBase} ${errors.email ? inputBad : inputOk}`}
        />
      </Labelled>
      <Labelled label="Role" htmlFor={`${id}-role`} error={errors.role}>
        <RoleSelect id={`${id}-role`} value={role} onChange={setRole} />
      </Labelled>
      <Labelled label="Temporary password" htmlFor={`${id}-password`} error={errors.password}>
        <div className="flex gap-2">
          <input
            id={`${id}-password`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            className={`${inputBase} font-mono ${errors.password ? inputBad : inputOk}`}
          />
          <button type="button" onClick={() => setPassword(generatePassword())} className={ghostButton}>
            New
          </button>
        </div>
      </Labelled>
      <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
        {message && <p role="alert" className="mr-auto text-sm text-req">{message}</p>}
        <button type="button" onClick={onCancel} disabled={busy} className={ghostButton}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </div>
    </form>
  );
}

type Mode = "view" | "edit" | "password" | "profile";

function StaffItem({ person, isMe }: { person: StaffRow; isMe: boolean }) {
  const id = useId();
  const [mode, setMode] = useState<Mode>("view");
  const [name, setName] = useState(person.name ?? "");
  const [role, setRole] = useState<Role>(person.role ?? "accounts");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, startWork] = useTransition();

  function open(next: Mode) {
    setName(person.name ?? "");
    setRole(person.role ?? "accounts");
    setPassword(next === "password" ? generatePassword() : "");
    setNewPassword(null);
    setMessage(null);
    setMode(next);
  }

  function run(action: () => Promise<Result>, after?: () => void) {
    startWork(async () => {
      const result = await action();
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage(null);
      setMode("view");
      after?.();
    });
  }

  function toggleDisabled() {
    const verb = person.disabled ? "Allow" : "Stop";
    if (!window.confirm(`${verb} ${person.name ?? person.email} signing in?`)) return;
    run(() => setDisabled(person.id, !person.disabled));
  }

  const label = person.name ?? person.email;

  return (
    <li className="px-4 py-3.5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-60">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{label}</span>
            {isMe && <Pill tone="brand">You</Pill>}
            {person.role && <Pill tone="neutral">{person.role === "admin" ? "Admin" : "Accounts"}</Pill>}
            {!person.role && <Pill tone="warn">No staff profile</Pill>}
            {person.disabled && <Pill tone="warn">Disabled</Pill>}
          </p>
          {person.name && <p className="text-[13px] text-muted">{person.email}</p>}
          <p className="mt-0.5 text-xs text-muted">
            {person.lastSignInAt ? `Last signed in ${formatWhen(person.lastSignInAt)}` : "Never signed in"}
          </p>
        </div>
        {mode === "view" && (
          <div className="flex flex-wrap gap-2">
            {person.role ? (
              <>
                <button type="button" onClick={() => open("edit")} disabled={busy} className={ghostButton}>
                  Edit
                </button>
                <button type="button" onClick={() => open("password")} disabled={busy} className={ghostButton}>
                  Reset password
                </button>
              </>
            ) : (
              <button type="button" onClick={() => open("profile")} disabled={busy} className={primaryButton}>
                Add as staff
              </button>
            )}
            {!isMe && (
              <button
                type="button"
                onClick={toggleDisabled}
                disabled={busy}
                className={
                  person.disabled
                    ? ghostButton
                    : "rounded-lg border border-red-200 bg-white px-[13px] py-2 text-[13px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                }
              >
                {person.disabled ? "Enable" : "Disable"}
              </button>
            )}
          </div>
        )}
      </div>

      {newPassword && (
        <div className="mt-3">
          <Credentials
            title="Password changed"
            email={person.email}
            password={newPassword}
            onClose={() => setNewPassword(null)}
          />
        </div>
      )}

      {(mode === "edit" || mode === "profile") && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => (mode === "edit" ? updateStaff(person.id, name, role) : addProfile(person.id, name, role)));
          }}
          noValidate
          className="mt-3 grid gap-3 rounded-lg border border-line bg-soft p-3 sm:grid-cols-2"
        >
          <Labelled label="Name" htmlFor={`${id}-name`}>
            <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} className={`${inputBase} ${inputOk}`} />
          </Labelled>
          <Labelled label="Role" htmlFor={`${id}-role`}>
            <RoleSelect id={`${id}-role`} value={role} onChange={setRole} disabled={isMe} />
            {isMe && <p className="mt-1 text-xs text-muted">You can&apos;t change your own role.</p>}
          </Labelled>
          <FormButtons
            busy={busy}
            message={message}
            submitLabel={mode === "edit" ? "Save" : "Add as staff"}
            onCancel={() => setMode("view")}
          />
        </form>
      )}

      {mode === "password" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const chosen = password;
            run(() => resetPassword(person.id, chosen), () => setNewPassword(chosen));
          }}
          noValidate
          className="mt-3 grid gap-3 rounded-lg border border-line bg-soft p-3 sm:grid-cols-2"
        >
          <Labelled label="New password" htmlFor={`${id}-password`}>
            <div className="flex gap-2">
              <input
                id={`${id}-password`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                className={`${inputBase} ${inputOk} font-mono`}
              />
              <button type="button" onClick={() => setPassword(generatePassword())} className={ghostButton}>
                New
              </button>
            </div>
          </Labelled>
          <FormButtons busy={busy} message={message} submitLabel="Set password" onCancel={() => setMode("view")} />
        </form>
      )}

      {mode === "view" && message && <p role="alert" className="mt-2 text-sm text-req">{message}</p>}
    </li>
  );
}

function FormButtons({
  busy,
  message,
  submitLabel,
  onCancel,
}: {
  busy: boolean;
  message: string | null;
  submitLabel: string;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
      {message && <p role="alert" className="mr-auto text-sm text-req">{message}</p>}
      <button type="button" onClick={onCancel} disabled={busy} className={ghostButton}>
        Cancel
      </button>
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </div>
  );
}

function RoleSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Role)}
      className={`${inputBase} ${inputOk}`}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

function Pill({ tone, children }: { tone: "brand" | "neutral" | "warn"; children: React.ReactNode }) {
  const tones = {
    brand: "border-[#c7dec5] bg-brand-soft text-brand-ink",
    neutral: "border-line bg-soft text-muted",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
  };
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

function Labelled({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-[5px] block text-[11px] font-semibold uppercase tracking-[0.09em] text-muted">
        {label}
      </label>
      {children}
      {error && <p className="mt-[5px] text-[11.5px] text-req">{error}</p>}
    </div>
  );
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}
