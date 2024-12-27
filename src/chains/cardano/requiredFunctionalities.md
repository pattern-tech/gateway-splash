## Main Chain Controller

`Poll`:
    - chain.controller.poll
    - PollRequest interface impl 
    - PollResponse interface impl

`nonce` : 
    - chain.controller.nonce
    - nonceRequest interface impl 
    - nonceResponse interface impl


`nextNonce` : 
    - chain.controller.next.nonce


`getTokens`:
    - chain.controller.nonce
    - tokenRequest interface impl 
    - tokenResponse interface impl

`allowance` and `approve` and `balances`:
    - chain.controller.balances
    - balanceRequest interface impl 
    - balanceResponse interface impl

`cancel` = ~~impl~~

`transfer` = ~~impl~~


## Cardano controller

`pool`:
    - cardano.init
    - cardano.getPool
`poll`: 
    - cardano.init
    - cardano.getTx
`balances` + `Allowances`: 
    - cardano.init
    - cardano.balances
    - cardano.getAddressUnspentBoxes -> getAddressUTXOs
    - cardano.getBalance

`getTokens`:
    - cardano.sortedAssetList

~~transfer~~
 
 