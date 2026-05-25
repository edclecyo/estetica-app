# BeautyHub Web

Versao web/PWA separada do app Android.

Esta pasta nao altera o app React Native Android. Ela usa Firebase Web SDK e as mesmas Cloud Functions ja existentes para as operacoes criticas.

## Rodar local

Abra `index.html` com um servidor estatico. Exemplo:

```bash
npx serve web/beautyhub
```

## Publicar

Quando estiver pronta para entrar no site, copie o conteudo desta pasta para uma pasta de hosting separada ou ajuste o Firebase Hosting para apontar para `web/beautyhub`.

Nao publique por cima do Android sem testar no Safari do iPhone.
