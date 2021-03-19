import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract BEP20Token is Ownable, ERC20("BEP20Token", "BEP20Token") {

  function mint(address _to, uint256 _amount) public onlyOwner {
      _mint(_to, _amount);
  }

}
