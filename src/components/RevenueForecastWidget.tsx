import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { License } from '../types';
import { format, subMonths, isAfter, startOfMonth } from 'date-fns';

const getLicenseFee = (license: License): number => {
  if (license.billing_cycle === 'profit_share') {
    return (license.monthly_earnings || 0) * (license.profit_share_pct ?? 15) / 100;
  }
  return license.product_price || 0;
};

export function RevenueForecastWidget({ licenses }: { licenses: License[] }) {
  const now = new Date();
  const months = [subMonths(now, 2), subMonths(now, 1), now];

  const data = months.map(m => {
    const monthStart = startOfMonth(m);
    const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0);
    
    const revenue = licenses
      .filter(l => {
        const created = new Date(l.created_at);
        return created <= monthEnd;
      })
      .reduce((acc, l) => acc + getLicenseFee(l), 0);

    return {
      name: format(m, 'MMM'),
      value: Math.round(revenue),
    };
  });

  // Simple growth projection
  const lastGrowth = data[1].value !== 0 ? (data[2].value - data[1].value) / data[1].value : 0;
  const forecastValue = Math.round(data[2].value * (1 + lastGrowth));
  
  data.push({ name: 'Next Q', value: forecastValue });

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="name" stroke="#71717a" fontSize={12} />
          <YAxis stroke="#71717a" fontSize={12} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46' }}
            itemStyle={{ color: '#e4e4e7' }}
          />
          <Area type="monotone" dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
