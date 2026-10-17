"use client";

import { PlanningPreferences } from "./planning-preferences";
import { Check, LoaderCircle, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { formatMoneyInput, minorToYuan, yuanToMinor } from "@/domain/money-input";

export type Profile = {
  age: number | null;
  familyStatus: string;
  riskLevel: string;
  baseCurrency: "CNY";
  stableMonthlyIncomeMinor: string;
  otherMonthlyIncomeMinor: string;
  rentExpenseMinor: string;
  transportExpenseMinor: string;
  essentialExpenseMinor: string;
};

const familyOptions = {
  SINGLE: "单身",
  PARTNERED: "有伴侣",
  MARRIED_NO_CHILDREN: "已婚，无子女",
  MARRIED_WITH_CHILDREN: "已婚，有子女",
  SINGLE_PARENT: "单亲家庭",
  OTHER: "其他",
};

const riskOptions = {
  CONSERVATIVE: "保守型",
  MODERATE_CONSERVATIVE: "稳健型",
  BALANCED: "平衡型",
  MODERATE_AGGRESSIVE: "成长型",
  AGGRESSIVE: "进取型",
};

function formatCurrency(value: bigint) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(Number(value) / 100);
}

export function ProfileDialog({ workspaceId, profile, monthlyIncome, monthlyOutflow, monthlyRepayment, saving, onClose, onSave }: {
  workspaceId?: string;
  profile: Profile;
  monthlyIncome: bigint;
  monthlyOutflow: bigint;
  monthlyRepayment: bigint;
  saving: boolean;
  onClose: () => void;
  onSave: (body: Profile) => Promise<boolean>;
}) {
  const [error, setError] = useState("");
  const balance = monthlyIncome - monthlyOutflow;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const saved = await onSave({
        age: data.get("age") ? Number(data.get("age")) : null,
        familyStatus: String(data.get("familyStatus")),
        riskLevel: String(data.get("riskLevel")),
        baseCurrency: "CNY",
        stableMonthlyIncomeMinor: yuanToMinor(data.get("stableMonthlyIncome")),
        otherMonthlyIncomeMinor: yuanToMinor(data.get("otherMonthlyIncome")),
        rentExpenseMinor: yuanToMinor(data.get("rentExpense")),
        transportExpenseMinor: yuanToMinor(data.get("transportExpense")),
        essentialExpenseMinor: yuanToMinor(data.get("essentialExpense")),
      });
      if (saved) onClose();
      else setError("保存失败，请检查输入后重试。");
    } catch (formError) {
      setError(formError instanceof Error ? formError.message : "请检查输入");
    }
  }

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (!saving && event.target === event.currentTarget) onClose(); }}>
    <section className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title">
      <header className="profile-dialog-header">
        <div><h2 id="profile-dialog-title">个人画像与每月收支</h2><p>这些信息用于财务计算和后续规划。</p></div>
        <button className="icon-button" type="button" aria-label="关闭个人画像" autoFocus disabled={saving} onClick={onClose}><X size={18} /></button>
      </header>
      <form className="profile-dialog-form" onSubmit={submit}>
        <div className="profile-dialog-body">
          {workspaceId && <PlanningPreferences workspaceId={workspaceId} />}
          <div className="profile-cashflow-summary" aria-label="当前每月收支汇总">
            <div><span>月收入</span><strong>{formatCurrency(monthlyIncome)}</strong></div>
            <div><span>月支出与还款</span><strong>{formatCurrency(monthlyOutflow)}</strong></div>
            <div><span>{balance < 0n ? "每月缺口" : "每月可结余"}</span><strong>{formatCurrency(balance < 0n ? -balance : balance)}</strong></div>
          </div>
          <fieldset><legend>基本情况</legend><div className="form-grid mt-4">
            <Field label="年龄"><input name="age" type="number" min="18" max="100" defaultValue={profile.age ?? ""} placeholder="例如 32" /></Field>
            <Field label="家庭情况"><select name="familyStatus" defaultValue={profile.familyStatus}>{Object.entries(familyOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="风险承受能力"><select name="riskLevel" defaultValue={profile.riskLevel}>{Object.entries(riskOptions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="默认币种"><input value="人民币 CNY" disabled /></Field>
          </div></fieldset>
          <fieldset><legend>月度收入</legend><div className="form-grid mt-4">
            <MoneyField name="stableMonthlyIncome" label="稳定月收入" value={profile.stableMonthlyIncomeMinor} />
            <MoneyField name="otherMonthlyIncome" label="其他月收入" value={profile.otherMonthlyIncomeMinor} />
          </div></fieldset>
          <fieldset><legend>月度必要支出</legend><div className="form-grid mt-4">
            <MoneyField name="essentialExpense" label="生活必要支出" value={profile.essentialExpenseMinor} />
            <MoneyField name="rentExpense" label="房租支出" value={profile.rentExpenseMinor} />
            <MoneyField name="transportExpense" label="交通支出" value={profile.transportExpenseMinor} />
            <Field label="每月还款"><input value={formatCurrency(monthlyRepayment)} disabled /></Field>
          </div><p className="profile-dialog-note">每月还款来自负债记录，请在负债区修改。</p></fieldset>
          {error && <div className="profile-dialog-error" role="alert">{error}</div>}
        </div>
        <footer className="profile-dialog-footer">
          <button className="button-secondary" type="button" disabled={saving} onClick={onClose}>取消</button>
          <button className="button-primary" disabled={saving}>{saving ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />}保存画像</button>
        </footer>
      </form>
    </section>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function MoneyField({ name, label, value }: { name: string; label: string; value: string }) {
  return <Field label={label}><div className="money-input"><span>¥</span><input name={name} inputMode="decimal" defaultValue={minorToYuan(value)} placeholder="0.00" onFocus={(event) => { event.currentTarget.value = event.currentTarget.value.replace(/,/g, ""); }} onBlur={(event) => { event.currentTarget.value = formatMoneyInput(event.currentTarget.value); }} /></div></Field>;
}
