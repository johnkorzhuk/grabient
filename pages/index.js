
import Head from 'next/head'

export default () => (
  <div>
    <Head>
      <meta name='viewport' content='width=device-width, initial-scale=1'/>
    </Head>

    <img width='112' src='https://cloud.githubusercontent.com/assets/13041/19686250/971bf7f8-9ac0-11e6-975c-188defd82df1.png' alt='next.js' />

    <style jsx global>{`
      html, body {
        height: 100%
      }

      body {
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0;
      }
    `}</style>
  </div>
)
