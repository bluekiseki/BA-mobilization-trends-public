import { useState } from 'react';

export default function ContactButton({ children }: { children: string }) {
  const [loading, setLoading] = useState(false);

  const handleSendEmail = async () => {
    try {
      setLoading(true);

      const response = await fetch('/api/contract');
      const json = (await response.json()) as any;

      if (!json?.data) throw new Error('Error');

      const email = atob(json.data);

      const link = document.createElement('a');
      link.href = `mailto:${email}`;
      link.click();
    } catch (error) {
      console.error('failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <span onClick={handleSendEmail} style={{ cursor: loading ? 'wait' : 'pointer' }}>
      {children}
    </span>
  );
}
