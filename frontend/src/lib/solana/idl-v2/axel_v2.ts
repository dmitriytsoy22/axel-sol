/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `axel_v2.json` next to this file.
 */
export type AxelV2 = {
  "address": "AXLcoEH3vJXUSL7nEr1T4d77NarThcbVrnbBzBR8XPZi",
  "metadata": {
    "name": "axelV2",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "AXEL v2: tokenized taxi cars with escrowed raises and exact revenue accounting"
  },
  "instructions": [
    {
      "name": "acceptAdmin",
      "docs": [
        "Second step of the admin handover, signed by the proposed admin."
      ],
      "discriminator": [
        112,
        42,
        45,
        90,
        116,
        181,
        13,
        170
      ],
      "accounts": [
        {
          "name": "pendingAdmin",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "activateProject",
      "docs": [
        "Pays a funded raise out to the treasury and the operator and starts operation.",
        "Admin only, before the activation deadline."
      ],
      "discriminator": [
        237,
        96,
        65,
        148,
        226,
        140,
        89,
        15
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Pays for missing destination accounts and receives the escrow's rent."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project.share_mint",
                "account": "project"
              }
            ]
          }
        },
        {
          "name": "paymentMint",
          "relations": [
            "project"
          ]
        },
        {
          "name": "escrowVault",
          "writable": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "treasury",
          "relations": [
            "config"
          ]
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "treasury"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "operator",
          "relations": [
            "project"
          ]
        },
        {
          "name": "operatorTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "operator"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "paymentTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "acquisitionDocHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "buyShares",
      "docs": [
        "Buys shares in an open raise; payment goes to the escrow. Moves the project to",
        "Funded when the last share is sold."
      ],
      "discriminator": [
        40,
        239,
        138,
        154,
        8,
        37,
        106,
        108
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "investor",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  118,
                  101,
                  115,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "shareMint",
          "writable": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "ownerShareAccount",
          "docs": [
            "The owner's canonical share account. Anyone can create it in advance, and it is then",
            "frozen by default; the purchase thaws it either way."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "shareTokenProgram"
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "paymentMint",
          "relations": [
            "project"
          ]
        },
        {
          "name": "ownerPaymentAccount",
          "writable": true
        },
        {
          "name": "escrowVault",
          "writable": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "shareTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "paymentTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "shares",
          "type": "u64"
        },
        {
          "name": "maxTotalCost",
          "type": "u64"
        }
      ]
    },
    {
      "name": "cancelRaise",
      "docs": [
        "Fails a raise that has not been activated, opening refunds. Admin only."
      ],
      "discriminator": [
        93,
        123,
        204,
        79,
        107,
        196,
        120,
        217
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project.share_mint",
                "account": "project"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelRecovery",
      "docs": [
        "Withdraws a pending recovery: the affected owner can veto it until its eta, the admin",
        "can withdraw it until it is executed."
      ],
      "discriminator": [
        176,
        23,
        203,
        37,
        121,
        251,
        227,
        83
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "The admin or the request's `from_owner`."
          ],
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "request",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  111,
                  118,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "request.project",
                "account": "recoveryRequest"
              },
              {
                "kind": "account",
                "path": "request.from_owner",
                "account": "recoveryRequest"
              }
            ]
          }
        },
        {
          "name": "proposer",
          "writable": true,
          "relations": [
            "request"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "claim",
      "docs": [
        "Pays a position's unclaimed revenue to the owner's canonical payment account.",
        "Anyone may trigger it for any owner."
      ],
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "claimer",
          "docs": [
            "Pays for the owner's payment account if it does not exist."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "owner"
        },
        {
          "name": "investor",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  118,
                  101,
                  115,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project.share_mint",
                "account": "project"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "paymentMint",
          "relations": [
            "project"
          ]
        },
        {
          "name": "ownerPaymentAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "revenueVault",
          "writable": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "paymentTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "closePosition",
      "docs": [
        "Closes an empty position and its share account, returning the rent to the owner.",
        "Once the project is closed it also burns the shares left in the position."
      ],
      "discriminator": [
        123,
        134,
        81,
        0,
        49,
        68,
        98,
        98
      ],
      "accounts": [
        {
          "name": "owner",
          "docs": [
            "Receives the rent of both accounts."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "shareMint",
          "writable": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "ownerShareAccount",
          "docs": [
            "Wallets let owners close empty token accounts on their own; such an account is",
            "recreated here and closed again, so the position can always be closed."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "shareTokenProgram"
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "shareTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "closeProject",
      "docs": [
        "Closes an operating or paused project for good without moving any funds; revenue",
        "stays claimable. Admin only."
      ],
      "discriminator": [
        117,
        209,
        53,
        106,
        93,
        55,
        112,
        49
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project.share_mint",
                "account": "project"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "createProject",
      "docs": [
        "Creates a share mint, its transfer hook accounts, the project and its escrow and",
        "revenue vaults, and opens the raise. Admin only."
      ],
      "discriminator": [
        148,
        219,
        181,
        42,
        221,
        114,
        145,
        190
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "shareMint",
          "docs": [
            "A fresh keypair; the share mint is created at this address."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ]
          }
        },
        {
          "name": "extraAccountMetas",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  120,
                  116,
                  114,
                  97,
                  45,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116,
                  45,
                  109,
                  101,
                  116,
                  97,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ]
          }
        },
        {
          "name": "paymentMint"
        },
        {
          "name": "escrowVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "project"
              }
            ]
          }
        },
        {
          "name": "revenueVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  118,
                  101,
                  110,
                  117,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "project"
              }
            ]
          }
        },
        {
          "name": "shareTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "paymentTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "createProjectParams"
            }
          }
        }
      ]
    },
    {
      "name": "depositRevenue",
      "docs": [
        "The operator pays in one period's revenue, co-signed by the project's oracle as",
        "attestor. The platform fee goes to the treasury, the rest to the holders pro rata."
      ],
      "discriminator": [
        224,
        212,
        82,
        100,
        60,
        240,
        220,
        29
      ],
      "accounts": [
        {
          "name": "operator",
          "docs": [
            "Supplies the revenue and pays for the period record."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "oracle",
          "docs": [
            "Must equal `project.oracle`."
          ],
          "signer": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project.share_mint",
                "account": "project"
              }
            ]
          }
        },
        {
          "name": "period",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  101,
                  114,
                  105,
                  111,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "project.period_count",
                "account": "project"
              }
            ]
          }
        },
        {
          "name": "paymentMint",
          "relations": [
            "project"
          ]
        },
        {
          "name": "operatorPaymentAccount",
          "writable": true
        },
        {
          "name": "revenueVault",
          "writable": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "treasury",
          "relations": [
            "config"
          ]
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "treasury"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "paymentTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "depositRevenueParams"
            }
          }
        }
      ]
    },
    {
      "name": "execute",
      "docs": [
        "Transfer hook of the share mints, invoked by Token-2022 on every share transfer.",
        "Settles revenue for both owners, moves the shares in their positions and rejects",
        "the transfer unless both owners are eligible and the project is operating."
      ],
      "discriminator": [
        105,
        37,
        101,
        197,
        75,
        251,
        102,
        26
      ],
      "accounts": [
        {
          "name": "source"
        },
        {
          "name": "mint"
        },
        {
          "name": "destination"
        },
        {
          "name": "authority",
          "docs": [
            "owners instead, so a delegate cannot move shares of an owner who lost KYC."
          ]
        },
        {
          "name": "extraAccountMetas"
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "project",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "sourceInvestor",
          "docs": [
            "record fails as `SourceNotAllowed`."
          ]
        },
        {
          "name": "destinationInvestor"
        },
        {
          "name": "sourcePosition",
          "docs": [
            "`destination_position` and Anchor does not reject duplicate mutable accounts."
          ],
          "writable": true
        },
        {
          "name": "destinationPosition",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "executeRecovery",
      "docs": [
        "Carries out a recovery after its delay: burns the shares of the old wallet, mints as",
        "many to the new one and moves the unclaimed revenue with them. Anyone may call it."
      ],
      "discriminator": [
        203,
        133,
        133,
        228,
        153,
        121,
        182,
        237
      ],
      "accounts": [
        {
          "name": "executor",
          "docs": [
            "Pays for the position and share account of `to_owner` if they do not exist."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "project",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ]
          }
        },
        {
          "name": "request",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  111,
                  118,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "fromOwner"
              }
            ]
          }
        },
        {
          "name": "proposer",
          "writable": true,
          "relations": [
            "request"
          ]
        },
        {
          "name": "shareMint",
          "writable": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "fromOwner"
        },
        {
          "name": "fromInvestor",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  118,
                  101,
                  115,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "fromOwner"
              }
            ]
          }
        },
        {
          "name": "fromPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "fromOwner"
              }
            ]
          }
        },
        {
          "name": "fromShareAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "fromOwner"
              },
              {
                "kind": "account",
                "path": "shareTokenProgram"
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "toOwner",
          "relations": [
            "request"
          ]
        },
        {
          "name": "toInvestor",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  118,
                  101,
                  115,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "toOwner"
              }
            ]
          }
        },
        {
          "name": "toPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "toOwner"
              }
            ]
          }
        },
        {
          "name": "toShareAccount",
          "docs": [
            "The canonical share account of `to_owner`; it is thawed here if someone created it",
            "frozen, so only an owner's canonical account ever holds shares."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "toOwner"
              },
              {
                "kind": "account",
                "path": "shareTokenProgram"
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "shareTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "finalizeRaise",
      "docs": [
        "Settles a raise whose outcome is certain: Funded or Failed. Anyone may call it."
      ],
      "discriminator": [
        207,
        230,
        200,
        181,
        254,
        7,
        85,
        209
      ],
      "accounts": [
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project.share_mint",
                "account": "project"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "initializeConfig",
      "docs": [
        "Creates the global config. Only the program's upgrade authority may call it."
      ],
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "program",
          "address": "AXLcoEH3vJXUSL7nEr1T4d77NarThcbVrnbBzBR8XPZi"
        },
        {
          "name": "programData"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "initializeConfigParams"
            }
          }
        }
      ]
    },
    {
      "name": "openPosition",
      "docs": [
        "Opens the owner's position and thaws its share account so it can receive shares.",
        "Anyone may pay; the owner needs an eligible KYC record but does not sign."
      ],
      "discriminator": [
        135,
        128,
        47,
        77,
        15,
        152,
        240,
        49
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "owner"
        },
        {
          "name": "investor",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  118,
                  101,
                  115,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "project",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "shareMint",
          "relations": [
            "project"
          ]
        },
        {
          "name": "ownerShareAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "shareTokenProgram"
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "shareTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "pauseProject",
      "docs": [
        "Pauses an operating project: no transfers or deposits, claims keep working. Admin only."
      ],
      "discriminator": [
        8,
        68,
        240,
        82,
        45,
        162,
        129,
        230
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project.share_mint",
                "account": "project"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "proposeAdmin",
      "docs": [
        "First step of the admin handover. The default key withdraws a pending proposal."
      ],
      "discriminator": [
        121,
        214,
        199,
        212,
        87,
        39,
        117,
        234
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newAdmin",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "proposeRecovery",
      "docs": [
        "Proposes moving `shares` of `from_owner`, a holder who lost its key, to its new wallet",
        "`to_owner` once `config.recovery_delay` has passed. Admin only."
      ],
      "discriminator": [
        15,
        85,
        115,
        138,
        219,
        199,
        133,
        144
      ],
      "accounts": [
        {
          "name": "admin",
          "docs": [
            "Pays the request's rent, which returns to it when the request is executed or cancelled."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "project",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project.share_mint",
                "account": "project"
              }
            ]
          }
        },
        {
          "name": "fromOwner"
        },
        {
          "name": "fromInvestor",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  118,
                  101,
                  115,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "fromOwner"
              }
            ]
          }
        },
        {
          "name": "fromPosition",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "fromOwner"
              }
            ]
          }
        },
        {
          "name": "toOwner"
        },
        {
          "name": "toInvestor",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  118,
                  101,
                  115,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "toOwner"
              }
            ]
          }
        },
        {
          "name": "request",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  111,
                  118,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "fromOwner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "shares",
          "type": "u64"
        },
        {
          "name": "reasonHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "recordTelemetry",
      "docs": [
        "Appends up to 20 daily records to the project's telemetry hash chain. Oracle only."
      ],
      "discriminator": [
        42,
        253,
        255,
        103,
        185,
        29,
        208,
        94
      ],
      "accounts": [
        {
          "name": "oracle",
          "signer": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project.share_mint",
                "account": "project"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "entries",
          "type": {
            "vec": {
              "defined": {
                "name": "telemetryEntry"
              }
            }
          }
        }
      ]
    },
    {
      "name": "refund",
      "docs": [
        "Burns the owner's shares of a failed raise and returns what they cost."
      ],
      "discriminator": [
        2,
        96,
        183,
        251,
        63,
        208,
        46,
        46
      ],
      "accounts": [
        {
          "name": "owner",
          "docs": [
            "Pays for its payment account if it does not exist."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "investor",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  118,
                  101,
                  115,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "project"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "shareMint",
          "writable": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "ownerShareAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "shareTokenProgram"
              },
              {
                "kind": "account",
                "path": "shareMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "paymentMint",
          "relations": [
            "project"
          ]
        },
        {
          "name": "ownerPaymentAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "escrowVault",
          "writable": true,
          "relations": [
            "project"
          ]
        },
        {
          "name": "shareTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "paymentTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "resumeProject",
      "docs": [
        "Resumes a paused project. Admin only."
      ],
      "discriminator": [
        11,
        74,
        18,
        128,
        57,
        187,
        127,
        235
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project.share_mint",
                "account": "project"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "setInvestor",
      "docs": [
        "Creates or updates the KYC record of `wallet`. Signed by the KYC authority, or by the",
        "demo KYC authority for DEMO records that expire within 30 days."
      ],
      "discriminator": [
        13,
        33,
        47,
        36,
        24,
        228,
        186,
        114
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "`config.kyc_authority` or `config.demo_kyc_authority`; pays for a new record."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "investor",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  110,
                  118,
                  101,
                  115,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "wallet"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "wallet",
          "type": "pubkey"
        },
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "setInvestorParams"
            }
          }
        }
      ]
    },
    {
      "name": "setProjectRoles",
      "docs": [
        "Replaces the operator or the oracle of an operating or paused project. Admin only."
      ],
      "discriminator": [
        59,
        111,
        160,
        195,
        12,
        41,
        138,
        46
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "project",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  106,
                  101,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "project.share_mint",
                "account": "project"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "operator",
          "type": {
            "option": "pubkey"
          }
        },
        {
          "name": "oracle",
          "type": {
            "option": "pubkey"
          }
        }
      ]
    },
    {
      "name": "updateConfig",
      "docs": [
        "Updates fees, windows, payment mints, pause flag and KYC keys. Admin only."
      ],
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "updateConfigParams"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "investor",
      "discriminator": [
        174,
        129,
        17,
        83,
        36,
        116,
        26,
        196
      ]
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    },
    {
      "name": "project",
      "discriminator": [
        205,
        168,
        189,
        202,
        181,
        247,
        142,
        19
      ]
    },
    {
      "name": "recoveryRequest",
      "discriminator": [
        143,
        116,
        126,
        64,
        175,
        138,
        150,
        111
      ]
    },
    {
      "name": "revenuePeriod",
      "discriminator": [
        56,
        54,
        193,
        254,
        205,
        149,
        212,
        70
      ]
    }
  ],
  "events": [
    {
      "name": "adminChanged",
      "discriminator": [
        232,
        34,
        31,
        226,
        62,
        18,
        19,
        114
      ]
    },
    {
      "name": "adminProposed",
      "discriminator": [
        129,
        249,
        226,
        227,
        199,
        82,
        110,
        243
      ]
    },
    {
      "name": "claimed",
      "discriminator": [
        217,
        192,
        123,
        72,
        108,
        150,
        248,
        33
      ]
    },
    {
      "name": "configUpdated",
      "discriminator": [
        40,
        241,
        230,
        122,
        11,
        19,
        198,
        194
      ]
    },
    {
      "name": "investorUpdated",
      "discriminator": [
        38,
        220,
        238,
        76,
        13,
        139,
        236,
        153
      ]
    },
    {
      "name": "positionClosed",
      "discriminator": [
        157,
        163,
        227,
        228,
        13,
        97,
        138,
        121
      ]
    },
    {
      "name": "positionOpened",
      "discriminator": [
        237,
        175,
        243,
        230,
        147,
        117,
        101,
        121
      ]
    },
    {
      "name": "projectActivated",
      "discriminator": [
        210,
        196,
        187,
        6,
        19,
        113,
        130,
        167
      ]
    },
    {
      "name": "projectClosed",
      "discriminator": [
        99,
        119,
        201,
        52,
        106,
        26,
        76,
        87
      ]
    },
    {
      "name": "projectCreated",
      "discriminator": [
        192,
        10,
        163,
        29,
        185,
        31,
        67,
        168
      ]
    },
    {
      "name": "projectPaused",
      "discriminator": [
        126,
        250,
        145,
        29,
        201,
        145,
        236,
        173
      ]
    },
    {
      "name": "projectResumed",
      "discriminator": [
        145,
        61,
        39,
        183,
        103,
        29,
        146,
        162
      ]
    },
    {
      "name": "raiseCancelled",
      "discriminator": [
        97,
        36,
        168,
        231,
        73,
        9,
        183,
        237
      ]
    },
    {
      "name": "raiseFinalized",
      "discriminator": [
        58,
        94,
        153,
        234,
        121,
        124,
        153,
        161
      ]
    },
    {
      "name": "recoveryCancelled",
      "discriminator": [
        191,
        25,
        236,
        86,
        25,
        77,
        117,
        96
      ]
    },
    {
      "name": "recoveryExecuted",
      "discriminator": [
        161,
        218,
        6,
        191,
        85,
        217,
        12,
        144
      ]
    },
    {
      "name": "recoveryProposed",
      "discriminator": [
        144,
        19,
        211,
        226,
        22,
        231,
        82,
        41
      ]
    },
    {
      "name": "refunded",
      "discriminator": [
        35,
        103,
        149,
        246,
        196,
        123,
        221,
        99
      ]
    },
    {
      "name": "revenueDeposited",
      "discriminator": [
        97,
        189,
        62,
        159,
        189,
        208,
        43,
        181
      ]
    },
    {
      "name": "rolesUpdated",
      "discriminator": [
        81,
        37,
        176,
        32,
        30,
        204,
        251,
        246
      ]
    },
    {
      "name": "sharesPurchased",
      "discriminator": [
        24,
        220,
        223,
        28,
        213,
        182,
        47,
        22
      ]
    },
    {
      "name": "sharesTransferred",
      "discriminator": [
        219,
        222,
        239,
        232,
        2,
        70,
        64,
        200
      ]
    },
    {
      "name": "telemetryRecorded",
      "discriminator": [
        181,
        188,
        43,
        19,
        80,
        11,
        77,
        112
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Signer is not authorized for this action"
    },
    {
      "code": 6001,
      "name": "invalidAddress",
      "msg": "Address must not be the default public key"
    },
    {
      "code": 6002,
      "name": "feeTooHigh",
      "msg": "Fee exceeds the protocol hard cap"
    },
    {
      "code": 6003,
      "name": "invalidDuration",
      "msg": "Duration must be greater than zero and within the protocol cap"
    },
    {
      "code": 6004,
      "name": "duplicatePaymentMint",
      "msg": "Allowed payment mints contain a duplicate"
    },
    {
      "code": 6005,
      "name": "demoAuthorityConflict",
      "msg": "Demo KYC authority must differ from the KYC authority"
    },
    {
      "code": 6006,
      "name": "adminUnchanged",
      "msg": "New admin must differ from the current admin"
    },
    {
      "code": 6007,
      "name": "noPendingAdmin",
      "msg": "There is no pending admin to accept"
    },
    {
      "code": 6008,
      "name": "invalidInvestorStatus",
      "msg": "Investor status None cannot be assigned"
    },
    {
      "code": 6009,
      "name": "invalidInvestorFlags",
      "msg": "Investor flags contain unknown bits"
    },
    {
      "code": 6010,
      "name": "invalidExpiry",
      "msg": "An active investor must expire in the future"
    },
    {
      "code": 6011,
      "name": "invalidJurisdiction",
      "msg": "Jurisdiction must be an ISO 3166-1 numeric code"
    },
    {
      "code": 6012,
      "name": "demoScopeViolation",
      "msg": "Demo KYC key may only grant or revoke DEMO access with the Demo provider"
    },
    {
      "code": 6013,
      "name": "demoExpiryTooLong",
      "msg": "Demo KYC access cannot last longer than 30 days"
    },
    {
      "code": 6014,
      "name": "demoRecordImmutable",
      "msg": "Demo KYC key cannot modify a frozen or non-DEMO investor record"
    },
    {
      "code": 6015,
      "name": "investorNotActive",
      "msg": "Investor KYC is not active"
    },
    {
      "code": 6016,
      "name": "investorExpired",
      "msg": "Investor KYC has expired"
    },
    {
      "code": 6017,
      "name": "investorFrozen",
      "msg": "Investor is frozen"
    },
    {
      "code": 6018,
      "name": "demoNotAllowed",
      "msg": "Project does not accept DEMO investors"
    },
    {
      "code": 6019,
      "name": "invalidState",
      "msg": "Instruction is not allowed in the current project state"
    },
    {
      "code": 6020,
      "name": "protocolPaused",
      "msg": "Protocol is paused"
    },
    {
      "code": 6021,
      "name": "paymentMintNotAllowed",
      "msg": "Payment mint is not in the allowlist"
    },
    {
      "code": 6022,
      "name": "unsupportedPaymentMint",
      "msg": "Payment mint has an unsupported Token-2022 extension"
    },
    {
      "code": 6023,
      "name": "invalidPrice",
      "msg": "Price per share must be greater than zero"
    },
    {
      "code": 6024,
      "name": "invalidShareSupply",
      "msg": "Share supply must satisfy 0 < soft cap <= total shares"
    },
    {
      "code": 6025,
      "name": "raiseTooShort",
      "msg": "Raise duration is shorter than the configured minimum"
    },
    {
      "code": 6026,
      "name": "activationWindowTooLong",
      "msg": "Activation window exceeds the configured maximum"
    },
    {
      "code": 6027,
      "name": "raiseEnded",
      "msg": "Raise deadline has passed"
    },
    {
      "code": 6028,
      "name": "raiseNotFinalizable",
      "msg": "Raise cannot be finalized yet"
    },
    {
      "code": 6029,
      "name": "exceedsSupply",
      "msg": "Purchase exceeds the remaining shares"
    },
    {
      "code": 6030,
      "name": "slippageExceeded",
      "msg": "Total cost exceeds the allowed maximum"
    },
    {
      "code": 6031,
      "name": "zeroAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6032,
      "name": "activationExpired",
      "msg": "Activation deadline has passed"
    },
    {
      "code": 6033,
      "name": "zeroSupply",
      "msg": "There are no outstanding shares"
    },
    {
      "code": 6034,
      "name": "notTransferring",
      "msg": "Hook was invoked outside of a Token-2022 transfer"
    },
    {
      "code": 6035,
      "name": "sourceNotAllowed",
      "msg": "Sender is not allowed to transfer shares"
    },
    {
      "code": 6036,
      "name": "destinationNotAllowed",
      "msg": "Recipient is not allowed to hold shares"
    },
    {
      "code": 6037,
      "name": "recipientNotOnboarded",
      "msg": "Recipient has no position in this project"
    },
    {
      "code": 6038,
      "name": "shareMintMismatch",
      "msg": "Mint is not the share mint of this project"
    },
    {
      "code": 6039,
      "name": "positionMismatch",
      "msg": "Position does not match the expected project or owner"
    },
    {
      "code": 6040,
      "name": "ledgerMismatch",
      "msg": "Token balance does not match the position ledger"
    },
    {
      "code": 6041,
      "name": "invalidTokenAccount",
      "msg": "Token account is not valid for this operation"
    },
    {
      "code": 6042,
      "name": "nothingToClaim",
      "msg": "Nothing to claim"
    },
    {
      "code": 6043,
      "name": "nothingToRefund",
      "msg": "Nothing to refund"
    },
    {
      "code": 6044,
      "name": "positionNotEmpty",
      "msg": "Position still holds shares or unclaimed revenue"
    },
    {
      "code": 6045,
      "name": "invalidPeriodDates",
      "msg": "Revenue period dates are invalid"
    },
    {
      "code": 6046,
      "name": "tooManyTelemetryEntries",
      "msg": "Too many telemetry entries in one transaction"
    },
    {
      "code": 6047,
      "name": "telemetryDateNotIncreasing",
      "msg": "Telemetry dates must strictly increase"
    },
    {
      "code": 6048,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6049,
      "name": "divisionByZero",
      "msg": "Division by zero"
    },
    {
      "code": 6050,
      "name": "checkpointAhead",
      "msg": "Position checkpoint is ahead of the project accumulator"
    },
    {
      "code": 6051,
      "name": "invalidBps",
      "msg": "Basis points exceed 10000"
    },
    {
      "code": 6052,
      "name": "invalidMetadata",
      "msg": "Token metadata is empty, too long, duplicated or uses a reserved key"
    },
    {
      "code": 6053,
      "name": "roleConflict",
      "msg": "Operator and oracle must be different keys"
    },
    {
      "code": 6054,
      "name": "invalidDocumentHash",
      "msg": "Acquisition document hash must not be empty"
    },
    {
      "code": 6055,
      "name": "vaultShortfall",
      "msg": "Vault holds less than the amount it owes"
    },
    {
      "code": 6056,
      "name": "invalidReportHash",
      "msg": "Revenue report hash must not be empty"
    },
    {
      "code": 6057,
      "name": "invalidAttestor",
      "msg": "Revenue deposit must be co-signed by the project's oracle"
    },
    {
      "code": 6058,
      "name": "emptyTelemetryBatch",
      "msg": "Telemetry batch is empty"
    },
    {
      "code": 6059,
      "name": "invalidTelemetryDate",
      "msg": "Telemetry date must be a calendar date as YYYYMMDD"
    },
    {
      "code": 6060,
      "name": "invalidRecoveryDelay",
      "msg": "Recovery delay must be between 1 hour and 30 days"
    },
    {
      "code": 6061,
      "name": "invalidReasonHash",
      "msg": "Recovery reason hash must not be empty"
    },
    {
      "code": 6062,
      "name": "recoveryToSameOwner",
      "msg": "Recovery must move shares to a different wallet"
    },
    {
      "code": 6063,
      "name": "insufficientShares",
      "msg": "Position holds fewer shares than the recovery moves"
    },
    {
      "code": 6064,
      "name": "recoveryNotReady",
      "msg": "Recovery delay has not elapsed"
    },
    {
      "code": 6065,
      "name": "vetoWindowClosed",
      "msg": "The owner's veto window has closed"
    },
    {
      "code": 6066,
      "name": "raiseTooLong",
      "msg": "Raise deadline is further away than the protocol cap"
    }
  ],
  "types": [
    {
      "name": "adminChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "previousAdmin",
            "type": "pubkey"
          },
          {
            "name": "newAdmin",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "adminProposed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "pendingAdmin",
            "docs": [
              "Default when the proposal was withdrawn."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "claimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "claimer",
            "docs": [
              "Signer that triggered the claim; payouts always go to the owner."
            ],
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "config",
      "docs": [
        "Global protocol settings, PDA `[\"config\"]`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "pendingAdmin",
            "docs": [
              "Proposed admin for the two-step handover; default when none is pending."
            ],
            "type": "pubkey"
          },
          {
            "name": "kycAuthority",
            "docs": [
              "Production KYC signer (backend, Sumsub)."
            ],
            "type": "pubkey"
          },
          {
            "name": "demoKycAuthority",
            "docs": [
              "Demo KYC signer with a restricted scope; default disables it."
            ],
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "docs": [
              "Owner of the payment-mint token accounts that receive platform fees."
            ],
            "type": "pubkey"
          },
          {
            "name": "raiseFeeBps",
            "type": "u16"
          },
          {
            "name": "revenueFeeBps",
            "type": "u16"
          },
          {
            "name": "minRaiseDuration",
            "type": "i64"
          },
          {
            "name": "maxActivationWindow",
            "type": "i64"
          },
          {
            "name": "allowedPaymentMints",
            "docs": [
              "Stablecoins a project may use for payments; unused slots are default."
            ],
            "type": {
              "array": [
                "pubkey",
                4
              ]
            }
          },
          {
            "name": "paused",
            "docs": [
              "Blocks buys, transfers, deposits, activation and recoveries. Never blocks claims,",
              "refunds or an owner's veto of a recovery."
            ],
            "type": "bool"
          },
          {
            "name": "projectCount",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "recoveryDelay",
            "docs": [
              "Seconds between proposing and executing a share recovery, during which the affected",
              "owner can veto it. A proposal keeps the delay it was made with."
            ],
            "type": "i64"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                24
              ]
            }
          }
        ]
      }
    },
    {
      "name": "configUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "kycAuthority",
            "type": "pubkey"
          },
          {
            "name": "demoKycAuthority",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "raiseFeeBps",
            "type": "u16"
          },
          {
            "name": "revenueFeeBps",
            "type": "u16"
          },
          {
            "name": "minRaiseDuration",
            "type": "i64"
          },
          {
            "name": "maxActivationWindow",
            "type": "i64"
          },
          {
            "name": "allowedPaymentMints",
            "type": {
              "array": [
                "pubkey",
                4
              ]
            }
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "recoveryDelay",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "createProjectParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pricePerShare",
            "docs": [
              "Price of one share in base units of the payment mint. Immutable."
            ],
            "type": "u64"
          },
          {
            "name": "totalShares",
            "type": "u64"
          },
          {
            "name": "softCapShares",
            "docs": [
              "Minimum shares sold by the deadline for the raise to succeed."
            ],
            "type": "u64"
          },
          {
            "name": "raiseDeadline",
            "type": "i64"
          },
          {
            "name": "activationWindow",
            "docs": [
              "Seconds the admin has to activate once the raise is funded."
            ],
            "type": "i64"
          },
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "allowDemo",
            "type": "bool"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "uri",
            "type": "string"
          },
          {
            "name": "additionalMetadata",
            "docs": [
              "Car attributes shown by wallets and explorers, e.g. make, model, year, city."
            ],
            "type": {
              "vec": {
                "defined": {
                  "name": "metadataField"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "depositRevenueParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gross",
            "docs": [
              "Revenue for holders before the platform fee, in base units of the payment mint."
            ],
            "type": "u64"
          },
          {
            "name": "periodStart",
            "docs": [
              "First day the deposit covers, as YYYYMMDD."
            ],
            "type": "u32"
          },
          {
            "name": "periodEnd",
            "docs": [
              "Last day the deposit covers, as YYYYMMDD."
            ],
            "type": "u32"
          },
          {
            "name": "reportHash",
            "docs": [
              "SHA-256 of the period's P&L report, published off-chain."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "revenueKind"
              }
            }
          }
        ]
      }
    },
    {
      "name": "initializeConfigParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "kycAuthority",
            "type": "pubkey"
          },
          {
            "name": "demoKycAuthority",
            "docs": [
              "Default disables the demo KYC flow."
            ],
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "raiseFeeBps",
            "type": "u16"
          },
          {
            "name": "revenueFeeBps",
            "type": "u16"
          },
          {
            "name": "minRaiseDuration",
            "type": "i64"
          },
          {
            "name": "maxActivationWindow",
            "type": "i64"
          },
          {
            "name": "allowedPaymentMints",
            "type": {
              "array": [
                "pubkey",
                4
              ]
            }
          },
          {
            "name": "recoveryDelay",
            "docs": [
              "Owner veto window of share recoveries in seconds; mainnet needs at least 72 hours."
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "investor",
      "docs": [
        "KYC record of one wallet, PDA `[\"investor\", wallet]`. `wallet` sits at offset 8."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "investorStatus"
              }
            }
          },
          {
            "name": "flags",
            "docs": [
              "Bit set of `Investor::FLAG_*`."
            ],
            "type": "u8"
          },
          {
            "name": "jurisdiction",
            "docs": [
              "ISO 3166-1 numeric country code (398 = Kazakhstan), 0 when not disclosed."
            ],
            "type": "u16"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "updatedAt",
            "type": "i64"
          },
          {
            "name": "provider",
            "type": {
              "defined": {
                "name": "kycProvider"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "investorStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "none"
          },
          {
            "name": "active"
          },
          {
            "name": "revoked"
          },
          {
            "name": "frozen"
          }
        ]
      }
    },
    {
      "name": "investorUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "investorStatus"
              }
            }
          },
          {
            "name": "flags",
            "type": "u8"
          },
          {
            "name": "jurisdiction",
            "type": "u16"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "provider",
            "type": {
              "defined": {
                "name": "kycProvider"
              }
            }
          },
          {
            "name": "authority",
            "docs": [
              "KYC key that signed the update."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "kycProvider",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "manual"
          },
          {
            "name": "sumsub"
          },
          {
            "name": "demo"
          }
        ]
      }
    },
    {
      "name": "metadataField",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "key",
            "type": "string"
          },
          {
            "name": "value",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "position",
      "docs": [
        "Share ledger of one owner in one project, PDA `[\"position\", project, owner]`.",
        "`project` sits at offset 8 and `owner` at offset 40 for memcmp filters."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "docs": [
              "Always equal to the owner's share token balance."
            ],
            "type": "u64"
          },
          {
            "name": "accCheckpoint",
            "docs": [
              "Accumulator value up to which revenue is already in `accrued`, Q64.64."
            ],
            "type": "u128"
          },
          {
            "name": "accrued",
            "docs": [
              "Settled revenue not yet claimed."
            ],
            "type": "u64"
          },
          {
            "name": "totalClaimed",
            "type": "u64"
          },
          {
            "name": "paidIn",
            "docs": [
              "Payment tokens paid for shares bought in the raise."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "positionClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "sharesBurned",
            "docs": [
              "Shares burned because the project had closed; zero otherwise."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "positionOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "payer",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "project",
      "docs": [
        "One tokenized car, PDA `[\"project\", share_mint]`. `share_mint` sits at offset 8."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "shareMint",
            "type": "pubkey"
          },
          {
            "name": "paymentMint",
            "type": "pubkey"
          },
          {
            "name": "paymentTokenProgram",
            "type": "pubkey"
          },
          {
            "name": "operator",
            "docs": [
              "Fleet operator: receives the raise on activation and deposits revenue."
            ],
            "type": "pubkey"
          },
          {
            "name": "oracle",
            "docs": [
              "Fleet reporting system: signs telemetry records and attests revenue deposits."
            ],
            "type": "pubkey"
          },
          {
            "name": "escrowVault",
            "docs": [
              "PDA token account `[\"escrow\", project]` holding the raise until activation or refund."
            ],
            "type": "pubkey"
          },
          {
            "name": "revenueVault",
            "docs": [
              "PDA token account `[\"revenue\", project]` holding deposited revenue until claimed."
            ],
            "type": "pubkey"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "projectState"
              }
            }
          },
          {
            "name": "flags",
            "docs": [
              "Bit set of `Project::FLAG_*`."
            ],
            "type": "u8"
          },
          {
            "name": "pricePerShare",
            "type": "u64"
          },
          {
            "name": "totalShares",
            "type": "u64"
          },
          {
            "name": "softCapShares",
            "type": "u64"
          },
          {
            "name": "sharesSold",
            "type": "u64"
          },
          {
            "name": "sharesRefunded",
            "type": "u64"
          },
          {
            "name": "raiseDeadline",
            "type": "i64"
          },
          {
            "name": "activationWindow",
            "docs": [
              "Seconds the admin has to activate once the raise is funded."
            ],
            "type": "i64"
          },
          {
            "name": "activationDeadline",
            "type": "i64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "activatedAt",
            "type": "i64"
          },
          {
            "name": "closedAt",
            "type": "i64"
          },
          {
            "name": "raiseFeeBps",
            "docs": [
              "Fees are snapshotted at creation; later config changes never touch a live project."
            ],
            "type": "u16"
          },
          {
            "name": "revenueFeeBps",
            "type": "u16"
          },
          {
            "name": "accPerShare",
            "docs": [
              "Revenue per share, Q64.64."
            ],
            "type": "u128"
          },
          {
            "name": "totalDepositedNet",
            "type": "u64"
          },
          {
            "name": "totalFees",
            "docs": [
              "Platform fees sent to the treasury (raise and revenue)."
            ],
            "type": "u64"
          },
          {
            "name": "totalClaimed",
            "type": "u64"
          },
          {
            "name": "totalRefunded",
            "type": "u64"
          },
          {
            "name": "periodCount",
            "type": "u32"
          },
          {
            "name": "telemetryHead",
            "docs": [
              "Hash chain head: `sha256(head || date_le || data_hash)`."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "telemetryCount",
            "type": "u32"
          },
          {
            "name": "lastTelemetryDate",
            "docs": [
              "Date of the last telemetry record as YYYYMMDD."
            ],
            "type": "u32"
          },
          {
            "name": "acquisitionDocHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "escrowBump",
            "type": "u8"
          },
          {
            "name": "revenueBump",
            "type": "u8"
          },
          {
            "name": "sharesRetired",
            "docs": [
              "Shares burned by `close_position` after the project closed."
            ],
            "type": "u64"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                56
              ]
            }
          }
        ]
      }
    },
    {
      "name": "projectActivated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "gross",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "operatorAmount",
            "type": "u64"
          },
          {
            "name": "acquisitionDocHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "projectClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "unclaimed",
            "docs": [
              "Revenue deposited for holders and not yet claimed; it stays claimable."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "projectCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "shareMint",
            "type": "pubkey"
          },
          {
            "name": "paymentMint",
            "type": "pubkey"
          },
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "pricePerShare",
            "type": "u64"
          },
          {
            "name": "totalShares",
            "type": "u64"
          },
          {
            "name": "softCapShares",
            "type": "u64"
          },
          {
            "name": "raiseDeadline",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "projectPaused",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "projectResumed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "projectState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "fundraising"
          },
          {
            "name": "funded"
          },
          {
            "name": "operating"
          },
          {
            "name": "paused"
          },
          {
            "name": "failed"
          },
          {
            "name": "closed"
          }
        ]
      }
    },
    {
      "name": "raiseCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "previousState",
            "type": {
              "defined": {
                "name": "projectState"
              }
            }
          }
        ]
      }
    },
    {
      "name": "raiseFinalized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "docs": [
              "`Funded` or `Failed`."
            ],
            "type": {
              "defined": {
                "name": "projectState"
              }
            }
          },
          {
            "name": "sharesSold",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "recoveryCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "fromOwner",
            "type": "pubkey"
          },
          {
            "name": "toOwner",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "cancelledBy",
            "docs": [
              "The admin, or `from_owner` exercising its veto."
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "recoveryExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "fromOwner",
            "type": "pubkey"
          },
          {
            "name": "toOwner",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "accruedMoved",
            "docs": [
              "Unclaimed revenue that moved along with the shares."
            ],
            "type": "u64"
          },
          {
            "name": "reasonHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "executor",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "recoveryProposed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "fromOwner",
            "type": "pubkey"
          },
          {
            "name": "toOwner",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "reasonHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "proposer",
            "type": "pubkey"
          },
          {
            "name": "eta",
            "docs": [
              "Earliest execution time; the affected owner can veto until then."
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "recoveryRequest",
      "docs": [
        "A pending move of a wallet's shares to another wallet of the same holder, for a lost key",
        "or an inheritance, PDA `[\"recovery\", project, from_owner]`. `project` sits at offset 8",
        "and `from_owner` at offset 40. One request per wallet and project can be pending."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "fromOwner",
            "type": "pubkey"
          },
          {
            "name": "toOwner",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "reasonHash",
            "docs": [
              "SHA-256 of the off-chain case file: the holder's request and identity evidence."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "proposer",
            "docs": [
              "Admin that proposed the request and paid its rent, which goes back to it."
            ],
            "type": "pubkey"
          },
          {
            "name": "proposedAt",
            "type": "i64"
          },
          {
            "name": "eta",
            "docs": [
              "Earliest execution time; `from_owner` can veto until then."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "refunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "revenueDeposited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u32"
          },
          {
            "name": "periodStart",
            "type": "u32"
          },
          {
            "name": "periodEnd",
            "type": "u32"
          },
          {
            "name": "gross",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "net",
            "type": "u64"
          },
          {
            "name": "supply",
            "type": "u64"
          },
          {
            "name": "accAfter",
            "type": "u128"
          },
          {
            "name": "reportHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "attestor",
            "type": "pubkey"
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "revenueKind"
              }
            }
          }
        ]
      }
    },
    {
      "name": "revenueKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "regular"
          },
          {
            "name": "final"
          }
        ]
      }
    },
    {
      "name": "revenuePeriod",
      "docs": [
        "One revenue deposit, PDA `[\"period\", project, index as u32 LE]`. `project` sits at offset 8."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u32"
          },
          {
            "name": "periodStart",
            "docs": [
              "Period dates as YYYYMMDD, declared by the operator."
            ],
            "type": "u32"
          },
          {
            "name": "periodEnd",
            "type": "u32"
          },
          {
            "name": "gross",
            "type": "u64"
          },
          {
            "name": "fee",
            "type": "u64"
          },
          {
            "name": "net",
            "type": "u64"
          },
          {
            "name": "supply",
            "docs": [
              "Shares outstanding when the deposit was distributed."
            ],
            "type": "u64"
          },
          {
            "name": "accAfter",
            "type": "u128"
          },
          {
            "name": "reportHash",
            "docs": [
              "SHA-256 of the period's P&L report, published off-chain."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "attestor",
            "docs": [
              "Oracle key that co-signed the deposit, attesting the report."
            ],
            "type": "pubkey"
          },
          {
            "name": "telemetryHead",
            "docs": [
              "Project telemetry chain head at the time of the deposit."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "revenueKind"
              }
            }
          },
          {
            "name": "depositedAt",
            "docs": [
              "Actual deposit time, so backfilled periods stay visible."
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "rolesUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "oracle",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "setInvestorParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "investorStatus"
              }
            }
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "jurisdiction",
            "type": "u16"
          },
          {
            "name": "flags",
            "type": "u8"
          },
          {
            "name": "provider",
            "type": {
              "defined": {
                "name": "kycProvider"
              }
            }
          }
        ]
      }
    },
    {
      "name": "sharesPurchased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "shares",
            "type": "u64"
          },
          {
            "name": "cost",
            "type": "u64"
          },
          {
            "name": "sharesSold",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "sharesTransferred",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "from",
            "type": "pubkey"
          },
          {
            "name": "to",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "telemetryEntry",
      "docs": [
        "One day of a car's operation. The full report is published off-chain; `data_hash`",
        "commits to it, and the other fields are a summary for explorers and indexers."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "date",
            "docs": [
              "Day of the report as YYYYMMDD."
            ],
            "type": "u32"
          },
          {
            "name": "dataHash",
            "docs": [
              "SHA-256 of the day's canonical (RFC 8785) JSON report."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "trips",
            "type": "u16"
          },
          {
            "name": "km",
            "type": "u32"
          },
          {
            "name": "rentPaid",
            "docs": [
              "Rent the park charged for the car that day, in whole units of the local currency."
            ],
            "type": "u32"
          },
          {
            "name": "status",
            "docs": [
              "Vehicle status code of the day, as defined by the published report schema."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "telemetryRecorded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "date",
            "type": "u32"
          },
          {
            "name": "dataHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "trips",
            "type": "u16"
          },
          {
            "name": "km",
            "type": "u32"
          },
          {
            "name": "rentPaid",
            "type": "u32"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "head",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "count",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "updateConfigParams",
      "docs": [
        "Every field is optional; `None` keeps the current value."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "kycAuthority",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "demoKycAuthority",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "treasury",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "raiseFeeBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "revenueFeeBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "minRaiseDuration",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "maxActivationWindow",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "allowedPaymentMints",
            "type": {
              "option": {
                "array": [
                  "pubkey",
                  4
                ]
              }
            }
          },
          {
            "name": "paused",
            "type": {
              "option": "bool"
            }
          },
          {
            "name": "recoveryDelay",
            "type": {
              "option": "i64"
            }
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "bpsDenominator",
      "type": "u16",
      "value": "10000"
    },
    {
      "name": "configSeed",
      "type": "bytes",
      "value": "[99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "escrowSeed",
      "type": "bytes",
      "value": "[101, 115, 99, 114, 111, 119]"
    },
    {
      "name": "extraAccountMetasSeed",
      "type": "bytes",
      "value": "[101, 120, 116, 114, 97, 45, 97, 99, 99, 111, 117, 110, 116, 45, 109, 101, 116, 97, 115]"
    },
    {
      "name": "investorSeed",
      "type": "bytes",
      "value": "[105, 110, 118, 101, 115, 116, 111, 114]"
    },
    {
      "name": "maxActivationWindow",
      "docs": [
        "Longest activation window the config may allow; a funded raise that is not activated",
        "within it becomes refundable."
      ],
      "type": "i64",
      "value": "7776000"
    },
    {
      "name": "maxDemoKycDuration",
      "docs": [
        "The demo KYC key can never grant access for longer than this."
      ],
      "type": "i64",
      "value": "2592000"
    },
    {
      "name": "maxJurisdiction",
      "docs": [
        "Upper bound of ISO 3166-1 numeric country codes; 0 means \"not disclosed\"."
      ],
      "type": "u16",
      "value": "999"
    },
    {
      "name": "maxMetadataFields",
      "type": "u8",
      "value": "8"
    },
    {
      "name": "maxMetadataKeyLen",
      "type": "u8",
      "value": "16"
    },
    {
      "name": "maxMetadataValueLen",
      "type": "u8",
      "value": "64"
    },
    {
      "name": "maxNameLen",
      "docs": [
        "Bounds on the share mint's token metadata. They keep `create_project` inside one",
        "transaction and bound the compute spent on metadata writes."
      ],
      "type": "u8",
      "value": "32"
    },
    {
      "name": "maxRaiseDuration",
      "docs": [
        "Longest raise a project may run. With the activation window cap it bounds how long an",
        "investor's payment can sit in escrow before it is released or refundable."
      ],
      "type": "i64",
      "value": "15552000"
    },
    {
      "name": "maxRaiseFeeBps",
      "docs": [
        "Hard ceiling on the platform fee taken from a successful raise."
      ],
      "type": "u16",
      "value": "500"
    },
    {
      "name": "maxRecoveryDelay",
      "docs": [
        "Longest recovery delay; it catches a delay given in milliseconds instead of seconds."
      ],
      "type": "i64",
      "value": "2592000"
    },
    {
      "name": "maxRevenueFeeBps",
      "docs": [
        "Hard ceiling on the platform fee taken from every revenue deposit."
      ],
      "type": "u16",
      "value": "2000"
    },
    {
      "name": "maxSymbolLen",
      "type": "u8",
      "value": "10"
    },
    {
      "name": "maxTelemetryEntries",
      "type": "u8",
      "value": "20"
    },
    {
      "name": "maxUriLen",
      "type": "u8",
      "value": "200"
    },
    {
      "name": "minRecoveryDelay",
      "docs": [
        "Shortest time the affected owner has to veto a share recovery. It rules out a seizure",
        "within one transaction and still fits a devnet demo. Mainnet must configure at least",
        "72 hours and keep the admin role in a Squads multisig (see the program's README)."
      ],
      "type": "i64",
      "value": "3600"
    },
    {
      "name": "periodSeed",
      "type": "bytes",
      "value": "[112, 101, 114, 105, 111, 100]"
    },
    {
      "name": "positionSeed",
      "type": "bytes",
      "value": "[112, 111, 115, 105, 116, 105, 111, 110]"
    },
    {
      "name": "projectSeed",
      "type": "bytes",
      "value": "[112, 114, 111, 106, 101, 99, 116]"
    },
    {
      "name": "recoverySeed",
      "type": "bytes",
      "value": "[114, 101, 99, 111, 118, 101, 114, 121]"
    },
    {
      "name": "revenueSeed",
      "type": "bytes",
      "value": "[114, 101, 118, 101, 110, 117, 101]"
    },
    {
      "name": "shareDecimals",
      "docs": [
        "Shares are whole units."
      ],
      "type": "u8",
      "value": "0"
    }
  ]
};
