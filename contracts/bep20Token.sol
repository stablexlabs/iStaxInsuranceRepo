import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "hardhat/console.sol";

contract bep20Token is Ownable, ERC20("bep20Token", "b20") {

  function mint(address _to, uint256 _amount) public onlyOwner {
      _mint(_to, _amount);
  }

}
