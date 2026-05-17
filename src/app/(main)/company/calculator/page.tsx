import type { Metadata } from 'next';
import CalculatorPageContent from '@/components/calculator/CalculatorPageContent';

export const metadata: Metadata = {
  title: 'Cost Calculator | Aesta',
};

export default function Page() {
  return <CalculatorPageContent />;
}
