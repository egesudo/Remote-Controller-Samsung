import React, { useState } from 'react';
import { ShieldAlert, ShieldCheck, Bug, Check, X, Mic } from 'lucide-react';
import { VALID_REMOTE_KEYS, CommandValidationResult } from '../types/tv.types.ts';
import { defaultValidator } from '../engine/commandValidator.ts';

interface SecurityValidatorCardProps {
  onTestArbitraryCommand: (cmd: string) => Promise<boolean>;
  onOpenVoiceAssistant?: () => void;
}

export const SecurityValidatorCard: React.FC<SecurityValidatorCardProps> = ({
  onTestArbitraryCommand,
  onOpenVoiceAssistant,
}) => {
  const [testInput, setTestInput] = useState('UNAUTHORIZED_EXPLOIT_CMD');
  const [lastValidation, setLastValidation] = useState<CommandValidationResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleTest = async (cmdToTest: string) => {
    setIsTesting(true);
    try {
      // Direct validator check
      const result = defaultValidator.validateKey(cmdToTest);
      setLastValidation(result);

      // Attempt dispatch via controller (will be blocked)
      await onTestArbitraryCommand(cmdToTest);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div id="security-validator-card" className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Komut Beyaz Listesi & Güvenlik Denetimi
            </h3>
            <p className="text-xs text-slate-500">
              Rastgele veya yetkisiz komutlara izin verilmez. Yapay Zeka / Ses katmanı kesinlikle bu kapıdan geçer.
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
          Devrede
        </span>
      </div>

      {/* Whitelist Badges */}
      <div className="mt-3">
        <p className="text-xs font-medium text-slate-600 mb-1.5">
          İzin Verilen TV Tuş Komutları ({VALID_REMOTE_KEYS.length} tuş):
        </p>
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
          {VALID_REMOTE_KEYS.map((key) => (
            <span
              key={key}
              className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700"
            >
              {key}
            </span>
          ))}
        </div>
      </div>

      {/* Interactive Injection / Invalid Command Tester */}
      <div className="mt-4 pt-4 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-800 mb-1.5 flex items-center gap-1">
          <Bug className="w-3.5 h-3.5 text-rose-500" />
          Güvenlik Bariyerini Test Et (Yetkisiz Komut Gönderme Girişimi):
        </p>
        <div className="flex gap-2">
          <input
            id="input-arbitrary-cmd"
            type="text"
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder="İzinli olmayan herhangi bir komut yazın..."
            className="flex-1 px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-rose-500"
          />
          <button
            id="btn-test-injection"
            onClick={() => handleTest(testInput)}
            disabled={isTesting || !testInput.trim()}
            className="min-h-[36px] px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            Doğrulayıcıya Gönder
          </button>
        </div>

        {/* Validation Result Box */}
        {lastValidation && (
          <div
            className={`mt-2.5 p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
              lastValidation.isValid
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            {lastValidation.isValid ? (
              <>
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Doğrulama Onaylandı</p>
                  <p className="text-[11px] font-mono mt-0.5">Tuş: {lastValidation.sanitizedKey}</p>
                </div>
              </>
            ) : (
              <>
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Güvenlik Kapısı İletimi Engelledi</p>
                  <p className="text-[11px] mt-0.5">{lastValidation.error}</p>
                  <p className="text-[10px] text-rose-600 mt-0.5">
                    Sonuç: Paket WebSocket'e ulaşmadan önce güvenli biçimde durduruldu ve düşürüldü.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Voice Command Whitelist Gate Integration */}
        {onOpenVoiceAssistant && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Mic className="w-3.5 h-3.5 text-indigo-600" />
              <span>Yapay Zeka Ses Güvenlik Kapısı</span>
            </div>
            <button
              onClick={onOpenVoiceAssistant}
              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>Sesli Komutları Test Et</span>
              <span>→</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
