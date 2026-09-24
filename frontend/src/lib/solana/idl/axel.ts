/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `axel.json` next to this file.
 */
export type Axel = {
  "address": "DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M",
  "metadata": {
    "name": "axel",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "addToWhitelist",
      "discriminator": [
        157,
        211,
        52,
        54,
        144,
        81,
        5,
        55
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "whitelistEntry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  104,
                  105,
                  116,
                  101,
                  108,
                  105,
                  115,
                  116
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
        }
      ]
    },
    {
      "name": "buyTokens",
      "discriminator": [
        189,
        21,
        230,
        133,
        247,
        2,
        110,
        42
      ],
      "accounts": [
        {
          "name": "investor",
          "writable": true,
          "signer": true
        },
        {
          "name": "admin",
          "writable": true
        },
        {
          "name": "projectState",
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
                "path": "projectState.mint",
                "account": "projectState"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "investorTokenAccount",
          "writable": true
        },
        {
          "name": "whitelistEntry",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  104,
                  105,
                  116,
                  101,
                  108,
                  105,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "investor"
              }
            ]
          }
        },
        {
          "name": "tokenExtensionsProgram",
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
      "args": [
        {
          "name": "tokenAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "claimRevenue",
      "discriminator": [
        4,
        22,
        151,
        70,
        183,
        79,
        73,
        189
      ],
      "accounts": [
        {
          "name": "investor",
          "writable": true,
          "signer": true
        },
        {
          "name": "projectState",
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
                "path": "projectState.mint",
                "account": "projectState"
              }
            ]
          }
        },
        {
          "name": "revenuePeriod",
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
                  101,
                  95,
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
                "path": "projectState.mint",
                "account": "projectState"
              },
              {
                "kind": "arg",
                "path": "periodIndex"
              }
            ]
          }
        },
        {
          "name": "revenueVault",
          "writable": true
        },
        {
          "name": "claimRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  108,
                  97,
                  105,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "revenuePeriod"
              },
              {
                "kind": "account",
                "path": "investor"
              }
            ]
          }
        },
        {
          "name": "investorTokenAccount"
        },
        {
          "name": "tokenExtensionsProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "periodIndex",
          "type": "u32"
        }
      ]
    },
    {
      "name": "closeProject",
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
          "writable": true,
          "signer": true,
          "relations": [
            "projectState"
          ]
        },
        {
          "name": "projectState",
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
                "path": "projectState.mint",
                "account": "projectState"
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
                "path": "projectState.mint",
                "account": "projectState"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "depositRevenue",
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
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "projectState"
          ]
        },
        {
          "name": "projectState",
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
                "path": "projectState.mint",
                "account": "projectState"
              }
            ]
          }
        },
        {
          "name": "revenueVault",
          "writable": true
        },
        {
          "name": "revenuePeriod",
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
                  101,
                  95,
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
                "path": "projectState.mint",
                "account": "projectState"
              },
              {
                "kind": "arg",
                "path": "periodIndex"
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
          "name": "periodIndex",
          "type": "u32"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeProject",
      "discriminator": [
        69,
        126,
        215,
        37,
        20,
        60,
        73,
        235
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint",
          "writable": true,
          "signer": true
        },
        {
          "name": "projectState",
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
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "revenueVault",
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
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "tokenExtensionsProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
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
              "name": "initializeProjectParams"
            }
          }
        }
      ]
    },
    {
      "name": "pauseProject",
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
            "projectState"
          ]
        },
        {
          "name": "projectState",
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
                "path": "projectState.mint",
                "account": "projectState"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "recordTelemetry",
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
          "writable": true,
          "signer": true
        },
        {
          "name": "projectState",
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
                "path": "projectState.mint",
                "account": "projectState"
              }
            ]
          }
        },
        {
          "name": "telemetryRecord",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  101,
                  108,
                  101,
                  109,
                  101,
                  116,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "projectState.mint",
                "account": "projectState"
              },
              {
                "kind": "arg",
                "path": "date"
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
        }
      ]
    },
    {
      "name": "removeFromWhitelist",
      "discriminator": [
        7,
        144,
        216,
        239,
        243,
        236,
        193,
        235
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "whitelistEntry",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  104,
                  105,
                  116,
                  101,
                  108,
                  105,
                  115,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "wallet"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "wallet",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "resumeProject",
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
            "projectState"
          ]
        },
        {
          "name": "projectState",
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
                "path": "projectState.mint",
                "account": "projectState"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "revokeMintAuthority",
      "discriminator": [
        140,
        52,
        61,
        238,
        209,
        157,
        189,
        32
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "projectState"
          ]
        },
        {
          "name": "projectState",
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
                "path": "projectState.mint",
                "account": "projectState"
              }
            ]
          }
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "tokenExtensionsProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        }
      ],
      "args": []
    },
    {
      "name": "updatePrice",
      "discriminator": [
        61,
        34,
        117,
        155,
        75,
        34,
        123,
        208
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "projectState"
          ]
        },
        {
          "name": "projectState",
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
                "path": "projectState.mint",
                "account": "projectState"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newPricePerShare",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "claimRecord",
      "discriminator": [
        57,
        229,
        0,
        9,
        65,
        62,
        96,
        7
      ]
    },
    {
      "name": "projectState",
      "discriminator": [
        41,
        49,
        200,
        239,
        125,
        191,
        219,
        242
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
    },
    {
      "name": "telemetryRecord",
      "discriminator": [
        141,
        116,
        168,
        113,
        181,
        239,
        96,
        44
      ]
    },
    {
      "name": "whitelistEntry",
      "discriminator": [
        51,
        70,
        173,
        81,
        219,
        192,
        234,
        62
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidTokenSupplyDivision",
      "msg": "Car cost must be exactly divisible by price per share"
    },
    {
      "code": 6001,
      "name": "zeroPricePerShare",
      "msg": "Price per share must be greater than zero"
    },
    {
      "code": 6002,
      "name": "projectNotActive",
      "msg": "Project is not Active"
    },
    {
      "code": 6003,
      "name": "investorNotWhitelisted",
      "msg": "Investor is not whitelisted"
    },
    {
      "code": 6004,
      "name": "zeroPurchase",
      "msg": "Token amount must be greater than zero"
    },
    {
      "code": 6005,
      "name": "insufficientVaultBalance",
      "msg": "Vault does not have enough tokens"
    },
    {
      "code": 6006,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6007,
      "name": "unauthorized",
      "msg": "Unauthorized: signer is not admin"
    },
    {
      "code": 6008,
      "name": "invalidRevenueVault",
      "msg": "Revenue vault address mismatch"
    },
    {
      "code": 6009,
      "name": "zeroDepositAmount",
      "msg": "Deposit amount must be greater than zero"
    },
    {
      "code": 6010,
      "name": "invalidPeriodIndex",
      "msg": "Period index does not match expected next period"
    },
    {
      "code": 6011,
      "name": "noTokensSold",
      "msg": "No tokens have been sold yet"
    },
    {
      "code": 6012,
      "name": "revenuePeriodMismatch",
      "msg": "Revenue period does not belong to this project"
    },
    {
      "code": 6013,
      "name": "invalidTokenAccount",
      "msg": "Invalid token account"
    },
    {
      "code": 6014,
      "name": "zeroTokenBalance",
      "msg": "Investor holds zero tokens"
    },
    {
      "code": 6015,
      "name": "zeroPayout",
      "msg": "Calculated payout is zero"
    },
    {
      "code": 6016,
      "name": "projectNotPaused",
      "msg": "Project is not Paused"
    },
    {
      "code": 6017,
      "name": "unauthorizedOracle",
      "msg": "Signer is not the registered oracle"
    },
    {
      "code": 6018,
      "name": "tokensStillAvailable",
      "msg": "Cannot revoke mint authority while tokens are still available for sale"
    },
    {
      "code": 6019,
      "name": "projectAlreadyClosed",
      "msg": "Project is already closed"
    }
  ],
  "types": [
    {
      "name": "claimRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "claimed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "initializeProjectParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "carCostLamports",
            "type": "u64"
          },
          {
            "name": "pricePerShareLamports",
            "type": "u64"
          },
          {
            "name": "transferHookProgramId",
            "type": "pubkey"
          },
          {
            "name": "oraclePubkey",
            "type": "pubkey"
          },
          {
            "name": "tokenName",
            "type": "string"
          },
          {
            "name": "tokenSymbol",
            "type": "string"
          },
          {
            "name": "tokenUri",
            "type": "string"
          },
          {
            "name": "vin",
            "type": "string"
          },
          {
            "name": "make",
            "type": "string"
          },
          {
            "name": "model",
            "type": "string"
          },
          {
            "name": "year",
            "type": "u16"
          },
          {
            "name": "valuationSol",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "projectState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "revenueVault",
            "type": "pubkey"
          },
          {
            "name": "tokenSupply",
            "docs": [
              "Total token supply (max that can ever be minted)"
            ],
            "type": "u64"
          },
          {
            "name": "tokensSold",
            "docs": [
              "Tokens sold so far"
            ],
            "type": "u64"
          },
          {
            "name": "pricePerShare",
            "docs": [
              "Price per share in lamports"
            ],
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "projectStatus"
              }
            }
          },
          {
            "name": "periodCount",
            "docs": [
              "Number of completed revenue distribution periods"
            ],
            "type": "u32"
          },
          {
            "name": "oraclePubkey",
            "docs": [
              "Oracle authority that can submit telemetry"
            ],
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "revenueVaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "projectStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "paused"
          },
          {
            "name": "closed"
          }
        ]
      }
    },
    {
      "name": "revenuePeriod",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "periodIndex",
            "type": "u32"
          },
          {
            "name": "totalDeposited",
            "docs": [
              "Total revenue deposited for this period (lamports)"
            ],
            "type": "u64"
          },
          {
            "name": "tokenSupplySnapshot",
            "docs": [
              "Token supply snapshot at time of deposit"
            ],
            "type": "u64"
          },
          {
            "name": "depositedAt",
            "docs": [
              "When the revenue was deposited (Unix timestamp)"
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
      "name": "telemetryRecord",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "project",
            "type": "pubkey"
          },
          {
            "name": "date",
            "docs": [
              "Date identifier (e.g. 20260401 for 2026-04-01)"
            ],
            "type": "u32"
          },
          {
            "name": "dataHash",
            "docs": [
              "SHA-256 hash of the Yandex Pro telemetry data"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "oraclePubkey",
            "docs": [
              "Oracle that submitted this record"
            ],
            "type": "pubkey"
          },
          {
            "name": "recordedAt",
            "docs": [
              "When recorded (Unix timestamp)"
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
      "name": "whitelistEntry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "approved",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
