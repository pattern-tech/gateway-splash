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


## Ergo controller

`pool`:
    - ergo.init
    - ergo.getPool
`poll`: 
    - ergo.init
    - ergo.getTx
`balances` + `Allowances`: 
    - ergo.init
    - ergo.balances
    - ergo.getAddressUnspentBoxes -> getAddressUTXOs
    - ergo.getBalance

`getTokens`:
    - ergo.sortedAssetList

~~transfer~~
 
 