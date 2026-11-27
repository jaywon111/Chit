export function HowItWorks(): JSX.Element {
  return <section className="page protocol-page" aria-labelledby="protocol-heading">
    <div className="page-heading"><div><h1 id="protocol-heading">About Chit<span className="heading-period">.</span></h1><p>A simple way to check an imaging receipt.</p></div></div>
    <div className="panel about-card">
      <div><h2>Checking a pass?</h2><p>Scan the QR code, choose a saved pass image, or open the link your clinic sent. You don’t need an account or a wallet.</p></div>
      <div><h2>Issuing a pass?</h2><p>Clinics and labs use QoreX to record a digital fingerprint of the receipt. Then they can hand over a QR image or share a link.</p></div>
      <div><h2>What the check means</h2><p>A verified pass matches the receipt that was recorded. It does not confirm that a scan took place or prove anyone’s identity. Chit receipts never include names, phone numbers, diagnoses, or medical images.</p></div>
    </div>
  </section>;
}
