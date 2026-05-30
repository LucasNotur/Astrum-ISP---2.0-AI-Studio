import React, { useState } from 'react';
import { Plus, Check, MoreVertical, Edit2, Trash2, Tag, Percent, Receipt } from 'lucide-react';

const MOCK_PLANS = [
  {
    id: '1',
    name: 'Starter',
    status: 'Active',
    price: '$49/mo',
    strategy: 'Flat Rate',
    features: [
      'Up to 3 Team Members',
      'Basic Analytics',
      'Community Support',
      '10GB Storage'
    ]
  },
  {
    id: '2',
    name: 'Growth',
    status: 'Active',
    price: '$149/mo',
    strategy: 'Tiered',
    features: [
      'Up to 10 Team Members',
      'Advanced Analytics',
      'Priority Email Support',
      '100GB Storage',
      'Custom Domains'
    ]
  },
  {
    id: '3',
    name: 'Enterprise',
    status: 'Draft',
    price: 'Custom',
    strategy: 'Volume',
    features: [
      'Unlimited Team Members',
      'Custom Reports',
      '24/7 Phone Support',
      'Unlimited Storage',
      'Dedicated Success Manager'
    ]
  }
];

export default function DarkPricingSettings() {
  const [activeTab, setActiveTab] = useState('modelos');

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-6 md:p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pricing Settings</h1>
            <p className="text-zinc-400 mt-2 text-sm">
              Manage your pricing models, discounts, and tax configurations.
            </p>
          </div>
          <button className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50 disabled:pointer-events-none bg-violet-600 text-white hover:bg-violet-700 h-10 px-4 py-2 gap-2 shadow-sm">
            <Plus className="h-4 w-4" />
            Create Plan
          </button>
        </div>

        {/* Tabs navigation */}
        <div className="flex space-x-6 border-b border-zinc-800">
          <button
            onClick={() => setActiveTab('modelos')}
            className={`pb-3 text-sm font-medium transition-colors relative flex items-center gap-2 ${
              activeTab === 'modelos' 
                ? 'text-violet-400' 
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Tag className="h-4 w-4" />
            Modelos de Preço
            {activeTab === 'modelos' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600 rounded-t-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('cupons')}
            className={`pb-3 text-sm font-medium transition-colors relative flex items-center gap-2 ${
              activeTab === 'cupons' 
                ? 'text-violet-400' 
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Percent className="h-4 w-4" />
            Descontos / Cupons
            {activeTab === 'cupons' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600 rounded-t-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('impostos')}
            className={`pb-3 text-sm font-medium transition-colors relative flex items-center gap-2 ${
              activeTab === 'impostos' 
                ? 'text-violet-400' 
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Receipt className="h-4 w-4" />
            Impostos
            {activeTab === 'impostos' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-600 rounded-t-full" />
            )}
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'modelos' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
            {MOCK_PLANS.map((plan) => (
              <div 
                key={plan.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors flex flex-col"
              >
                {/* Card Header */}
                <div className="p-6 border-b border-zinc-800 flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg text-zinc-50">{plan.name}</h3>
                    <div className="mt-1">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {plan.strategy}
                      </span>
                    </div>
                  </div>
                  <div>
                    {plan.status === 'Active' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                        Draft
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-6 flex-1 flex flex-col">
                  <div className="mb-6 text-2xl font-bold text-zinc-50">
                    {plan.price}
                  </div>

                  <div className="flex-1 space-y-3">
                    {plan.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <Check className="h-4 w-4 text-violet-500 mt-0.5 shrink-0" />
                        <span className="text-sm text-zinc-400">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Card Footer / Actions */}
                <div className="px-6 py-4 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between">
                  <button className="text-zinc-400 hover:text-zinc-50 transition-colors p-2 rounded-md hover:bg-zinc-800">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button className="text-zinc-500 hover:text-red-400 transition-colors p-2 rounded-md hover:bg-zinc-800">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button className="text-zinc-400 hover:text-zinc-50 transition-colors p-2 rounded-md hover:bg-zinc-800 ml-auto">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'cupons' && (
          <div className="p-12 text-center border border-dashed border-zinc-800 rounded-xl bg-zinc-900 animate-in fade-in duration-300">
            <Percent className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-zinc-50">Descontos / Cupons</h3>
            <p className="text-zinc-400 mt-1 max-w-sm mx-auto text-sm">
              Nenhum cupom configurado ainda. Crie promoções atrativas para seus clientes.
            </p>
            <button className="mt-6 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50 disabled:pointer-events-none bg-zinc-800 text-zinc-50 hover:bg-zinc-700 h-9 px-4 py-2 gap-2 shadow-sm border border-zinc-700">
              <Plus className="h-4 w-4" />
              Novo Cupom
            </button>
          </div>
        )}

        {activeTab === 'impostos' && (
          <div className="p-12 text-center border border-dashed border-zinc-800 rounded-xl bg-zinc-900 animate-in fade-in duration-300">
            <Receipt className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-zinc-50">Impostos</h3>
            <p className="text-zinc-400 mt-1 max-w-sm mx-auto text-sm">
              Configure alíquotas de imposto automáticas baseadas na localização.
            </p>
            <button className="mt-6 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50 disabled:pointer-events-none bg-zinc-800 text-zinc-50 hover:bg-zinc-700 h-9 px-4 py-2 gap-2 shadow-sm border border-zinc-700">
              <Plus className="h-4 w-4" />
              Configurar Taxas
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
