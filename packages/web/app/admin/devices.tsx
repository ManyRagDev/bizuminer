"use client";

import { useState } from "react";

type Device = {
  id: string;
  name: string;
  tokenPrefix: string | null;
  pairedAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/**
 * Dispositivos da extensão (E7). Mostra nome, prefixo de token (nunca o token
 * bruto), último uso e status; permite revogar. Só o dono vê.
 */
export default function Devices() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [message, setMessage] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState("");

  async function load() {
    try {
      const response = await fetch("/api/admin/extension/devices?affiliateId=aff_local");
      const payload = (await response.json()) as { ok: boolean; devices?: Device[] };
      if (payload.ok && payload.devices) setDevices(payload.devices);
      else setDevices([]);
    } catch {
      setDevices([]);
    }
  }

  async function generateCode() {
    setMessage("");
    setPairingCode(null);
    try {
      const response = await fetch("/api/extension/pairing-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: deviceName.trim() || "Navegador" }),
      });
      const payload = (await response.json()) as { ok: boolean; pairingCode?: string; error?: string };
      if (payload.ok && payload.pairingCode) {
        setPairingCode(payload.pairingCode);
      } else {
        setMessage(payload.error === "rate_limited" ? "Limite de códigos por hora atingido." : "Não foi possível gerar o código.");
      }
    } catch {
      setMessage("Falha de rede ao gerar o código.");
    }
  }

  async function revoke(deviceId: string) {
    setMessage("");
    try {
      const response = await fetch("/api/admin/extension/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", affiliateId: "aff_local", deviceId }),
      });
      const payload = (await response.json()) as { ok: boolean };
      setMessage(payload.ok ? "Dispositivo revogado." : "Não foi possível revogar.");
      await load();
    } catch {
      setMessage("Falha de rede ao revogar.");
    }
  }

  if (devices === null) {
    return (
      <section className="admin-section" aria-labelledby="devices-title">
        <h2 id="devices-title">Dispositivos da extensão</h2>
        <button type="button" onClick={() => void load()}>carregar dispositivos</button>
      </section>
    );
  }

  return (
    <section className="admin-section" aria-labelledby="devices-title">
      <h2 id="devices-title">Dispositivos da extensão</h2>

      <div className="capturador-form">
        <input
          type="text"
          value={deviceName}
          onChange={(event) => setDeviceName(event.target.value)}
          placeholder="nome do dispositivo (ex.: Chrome do notebook)"
        />
        <button type="button" onClick={() => void generateCode()}>gerar código de pareamento</button>
      </div>
      {pairingCode && (
        <p className="admin-message" role="status">
          Código (válido por 10 min): <b>{pairingCode}</b> — cole na extensão.
        </p>
      )}

      {devices.length === 0 ? (
        <p className="member-empty">Nenhum dispositivo pareado ainda.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>nome</th>
              <th>token</th>
              <th>pareado</th>
              <th>último uso</th>
              <th>status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.id}>
                <td>{device.name}</td>
                <td>{device.tokenPrefix ? `${device.tokenPrefix}…` : "—"}</td>
                <td>{device.pairedAt ? dateTime(device.pairedAt) : "—"}</td>
                <td>{device.lastUsedAt ? dateTime(device.lastUsedAt) : "—"}</td>
                <td>{device.revokedAt ? "revogado" : "ativo"}</td>
                <td>
                  {!device.revokedAt && (
                    <button type="button" onClick={() => void revoke(device.id)}>revogar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {message && <p className="admin-message" role="status">{message}</p>}
      <p className="admin-footnote">Revogar interrompe a captura no próximo request; o token bruto nunca aparece aqui.</p>
    </section>
  );
}
