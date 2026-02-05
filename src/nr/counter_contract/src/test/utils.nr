use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};

pub unconstrained fn setup_contract(
    with_account_contracts: bool,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();
    let (owner, user) = if with_account_contracts {
        let owner = env.create_contract_account();
        let user = env.create_contract_account();
        (owner, user)
    } else {
        let owner = env.create_light_account();
        let user = env.create_light_account();
        (owner, user)
    };

    let contract_address = deploy_contract(&mut env);

    (&mut env, contract_address, owner, user)
}

pub unconstrained fn deploy_contract(env: &mut TestEnvironment) -> AztecAddress {
    let contract_address = env.deploy("Counter").without_initializer();

    contract_address
}
