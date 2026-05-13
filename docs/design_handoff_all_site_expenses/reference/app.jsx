// Root: assembles all the artboards into a DesignCanvas.

function App() {
  return (
    <DesignCanvas>
      <DCSection
        id="full-page"
        title="All Site Expenses · redesign"
        subtitle="Desktop and mobile, side by side. Same data, different surface."
      >
        <DCArtboard id="desktop" label="Desktop · 1440w" width={1440} height={1180}>
          <DesktopPage tradeVariant="detailed"/>
        </DCArtboard>
        <DCArtboard id="mobile" label="Mobile · expenses" width={390} height={1180}>
          <MobilePage tradeVariant="chips"/>
        </DCArtboard>
      </DCSection>

      <DCSection
        id="trade-variants"
        title="Trade strip · variants"
        subtitle="Toggle in the user's mental model. Tweakable per surface."
      >
        <DCArtboard id="td-detailed" label="A · Detailed cards" width={920} height={360}>
          <TradeIsolated variant="detailed"/>
        </DCArtboard>
        <DCArtboard id="td-compact" label="B · Compact rows" width={920} height={420}>
          <TradeIsolated variant="compact"/>
        </DCArtboard>
        <DCArtboard id="td-chips" label="C · Chips" width={920} height={220}>
          <TradeIsolated variant="chips"/>
        </DCArtboard>
      </DCSection>

      <DCPostIt top={140} left={40} width={220} rotate={-3}>
        Hero metrics now answer the question
        the original page didn't: "How is the
        project doing?" — not just "what was spent".
      </DCPostIt>
      <DCPostIt top={520} left={40} width={220} rotate={2}>
        Trades are a <b>lens</b>, not a parallel
        section. Empty trades collapse so they
        don't waste 7 cards of horizontal space.
      </DCPostIt>
      <DCPostIt top={820} left={40} width={220} rotate={-2}>
        Excel-like table: search, sortable
        columns, group-by, density toggle,
        sticky header, filtered totals in footer.
      </DCPostIt>
    </DesignCanvas>
  );
}

function TradeIsolated({ variant }) {
  return (
    <div style={{
      width:'100%', height:'100%', background:T.bg, padding:'22px 26px',
      fontFamily:T.font, color:T.text, overflow:'hidden',
    }}>
      <Section
        label={`By trade · ${variant} variant`}
        action={<span style={{fontSize:11.5, color:T.subtle, fontWeight:500}}>
          {TRADES.filter(t => t.amount > 0).length} of {TRADES.length} active
        </span>}
      >
        <TradeStrip variant={variant} trades={TRADES}/>
      </Section>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
