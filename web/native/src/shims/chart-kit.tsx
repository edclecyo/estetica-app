import React from 'react';
import { ScrollView, Text, View } from 'react-native';

type ChartData = {
  labels?: string[];
  datasets?: Array<{ data?: number[] }>;
};

function currency(value: number) {
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(Math.round(value));
}

export function BarChart({
  data,
  width = 320,
  height = 220,
  yAxisLabel = '',
  yAxisSuffix = '',
  chartConfig,
  style,
}: {
  data: ChartData;
  width?: number;
  height?: number;
  yAxisLabel?: string;
  yAxisSuffix?: string;
  chartConfig?: any;
  style?: any;
}) {
  const labels = data?.labels?.length ? data.labels : ['-'];
  const values = data?.datasets?.[0]?.data?.length ? data.datasets[0].data.map(Number) : [0];
  const max = Math.max(...values, 1);
  const chartWidth = Math.max(Number(width) || 320, labels.length * 58 + 36);
  const chartHeight = Math.max(Number(height) || 220, 180);
  const barAreaHeight = chartHeight - 72;
  const barColor =
    typeof chartConfig?.color === 'function'
      ? chartConfig.color(1)
      : chartConfig?.barColor || '#C9A96E';

  return (
    <View
      style={[
        {
          width,
          height: chartHeight,
          overflow: 'hidden',
          borderRadius: 16,
        },
        style,
      ]}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View
          style={{
            width: chartWidth,
            height: chartHeight,
            paddingHorizontal: 14,
            paddingTop: 14,
            paddingBottom: 8,
          }}
        >
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
            {values.map((raw, index) => {
              const value = Number.isFinite(raw) ? raw : 0;
              const barHeight = Math.max(6, (value / max) * barAreaHeight);

              return (
                <View
                  key={`${labels[index] || index}-${index}`}
                  style={{
                    flex: 1,
                    minWidth: 42,
                    height: barAreaHeight + 42,
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      color: '#D8C8A6',
                      fontSize: 10,
                      fontWeight: '800',
                      marginBottom: 6,
                    }}
                  >
                    {yAxisLabel}{currency(value)}{yAxisSuffix}
                  </Text>
                  <View
                    style={{
                      width: 26,
                      height: barHeight,
                      borderRadius: 8,
                      backgroundColor: barColor,
                      opacity: value > 0 ? 1 : 0.28,
                    }}
                  />
                  <Text
                    numberOfLines={1}
                    style={{
                      color: '#8B8B8B',
                      fontSize: 10,
                      fontWeight: '700',
                      marginTop: 8,
                      maxWidth: 56,
                    }}
                  >
                    {labels[index] || '-'}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

export function LineChart(props: any) {
  return <BarChart {...props} />;
}

export function PieChart({ data, width = 320, height = 180, style }: any) {
  const total = Array.isArray(data)
    ? data.reduce((sum, item) => sum + Number(item?.population || item?.value || 0), 0)
    : 0;

  return (
    <View style={[{ width, minHeight: height, padding: 14, borderRadius: 16 }, style]}>
      {Array.isArray(data) && data.map((item: any, index: number) => {
        const value = Number(item?.population || item?.value || 0);
        const percent = total > 0 ? Math.round((value / total) * 100) : 0;

        return (
          <View key={`${item?.name || index}`} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '800' }}>{item?.name || '-'}</Text>
              <Text style={{ color: '#C9A96E', fontSize: 12, fontWeight: '800' }}>{percent}%</Text>
            </View>
            <View style={{ height: 9, borderRadius: 5, backgroundColor: '#242424', overflow: 'hidden' }}>
              <View
                style={{
                  height: 9,
                  width: `${percent}%`,
                  backgroundColor: item?.color || '#C9A96E',
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
